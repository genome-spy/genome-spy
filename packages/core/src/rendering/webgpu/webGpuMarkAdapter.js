import { color as parseColor } from "d3-color";
import { format as numberFormat } from "d3-format";
import { packHighPrecisionU32Array } from "@genome-spy/webgpu-renderer/high-precision";
import { pointMark } from "@genome-spy/webgpu-renderer/marks/point";
import { rectMark } from "@genome-spy/webgpu-renderer/marks/rect";
import { ruleMark } from "@genome-spy/webgpu-renderer/marks/rule";
import { linkMark } from "@genome-spy/webgpu-renderer/marks/link";
import { arrowMark } from "@genome-spy/webgpu-renderer/marks/arrow";
import { textMark } from "@genome-spy/webgpu-renderer/marks/text";
import { bandScale } from "@genome-spy/webgpu-renderer/scales/band";
import { identityScale } from "@genome-spy/webgpu-renderer/scales/identity";
import { indexScale } from "@genome-spy/webgpu-renderer/scales/index";
import { logScale } from "@genome-spy/webgpu-renderer/scales/log";
import { linearScale } from "@genome-spy/webgpu-renderer/scales/linear";
import { ordinalScale } from "@genome-spy/webgpu-renderer/scales/ordinal";
import { powScale } from "@genome-spy/webgpu-renderer/scales/pow";
import { quantizeScale } from "@genome-spy/webgpu-renderer/scales/quantize";
import { sqrtScale } from "@genome-spy/webgpu-renderer/scales/sqrt";
import { symlogScale } from "@genome-spy/webgpu-renderer/scales/symlog";
import { thresholdScale } from "@genome-spy/webgpu-renderer/scales/threshold";

import { getMarkData } from "../immediate/markData.js";
import { resolveMarkProperty } from "../immediate/markEncoding.js";
import { isLargeGenome } from "../../gl/glslScaleGenerator.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";
import {
    findChannelDefWithScale,
    getSecondaryChannel,
    isChannelWithScale,
} from "../../encoder/encoder.js";

const SHAPE_CODES = new Map(
    [
        "circle",
        "square",
        "cross",
        "diamond",
        "triangle-up",
        "triangle-right",
        "triangle-down",
        "triangle-left",
        "tick-up",
        "tick-right",
        "tick-down",
        "tick-left",
        "x",
        "+",
    ].map((shape, index) => [shape, index])
);

const ALIGN_CODES = new Map([
    ["left", 0],
    ["center", 1],
    ["right", 2],
]);

const BASELINE_CODES = new Map([
    ["alphabetic", 0],
    ["baseline", 0],
    ["middle", 1],
    ["top", 2],
    ["bottom", 3],
]);

const STROKE_CAP_CODES = new Map([
    ["butt", 0],
    ["square", 1],
    ["round", 2],
]);

const LINK_SHAPE_CODES = new Map([
    ["arc", 0],
    ["dome", 1],
    ["diagonal", 2],
    ["line", 3],
]);

const ORIENT_CODES = new Map([
    ["vertical", 0],
    ["horizontal", 1],
]);

const ARROW_DIRECTION_CODES = new Map([
    ["forward", 0],
    ["reverse", 1],
]);

const ARROW_HEAD_SHAPE_CODES = new Map([
    ["triangle", 0],
    ["open", 1],
]);

const ARROW_HEAD_PLACEMENT_CODES = new Map([
    ["inside", 0],
    ["outside", 1],
]);

const HATCH_CODES = new Map(
    [
        "none",
        "diagonal",
        "antiDiagonal",
        "cross",
        "vertical",
        "horizontal",
        "grid",
        "dots",
        "rings",
        "ringsLarge",
    ].map((hatch, index) => [hatch, index])
);

/**
 * Materialized collector batch identity acts as the data revision. Only field
 * accessors are cached because expression accessors may depend on parameters
 * that change without replacing the batch.
 *
 * @type {WeakMap<import("../../marks/mark.js").default, SeriesCache>}
 */
const SERIES_CACHE = new WeakMap();

/** @type {WeakMap<import("../../marks/mark.js").default, Set<string>>} */
const DYNAMIC_PROPERTY_WATCHES = new WeakMap();

/** @type {WeakMap<import("../../marks/mark.js").default, {revision: number, expressions: Set<string>}>} */
const DYNAMIC_ENCODING_STATE = new WeakMap();

/** @type {WeakMap<import("../../marks/mark.js").default, ResourceRevisionState>} */
const RESOURCE_REVISION_STATE = new WeakMap();

/** @type {WeakMap<import("../../marks/mark.js").default, PackedMarkData>} */
const PACKED_DATA_CACHE = new WeakMap();

/** @type {WeakMap<import("../../marks/mark.js").default, {data: object[], encoder: object, values: Uint32Array}>} */
const PLACEMENT_INDEX_CACHE = new WeakMap();

/**
 * Converts one Core mark occurrence into the low-level configuration used by
 * the WebGPU renderer. Unsupported Core features fail here with a contextual
 * error rather than being silently dropped.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number | (() => number)} [viewOpacity]
 * @param {object[]} [dataOverride]
 * @param {import("@genome-spy/webgpu-renderer").MarkConfig["placementIndex"]} [placementIndex]
 * @returns {{definition: import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>, config: object} | undefined}
 */
export function createWebGpuMarkConfig(
    mark,
    options,
    coords,
    viewOpacity = 1,
    dataOverride,
    placementIndex
) {
    watchDynamicProperties(mark, getDynamicChannelProperties(mark.getType()));
    watchDynamicEncodings(mark);
    watchScaleResolutions(mark);
    const readViewOpacity =
        typeof viewOpacity == "function" ? viewOpacity : () => viewOpacity;

    const data = dataOverride ?? getMarkData(mark, options);
    if (data.length == 0) {
        return undefined;
    }

    const resolvedPlacementIndex = mark.encoders.facetIndex
        ? {
              data: toPlacementIndexArray(mark, data),
              type: "u32",
          }
        : placementIndex;

    const markType = mark.getType();
    if (markType == "point") {
        return {
            definition: pointMark,
            config: addPlacementIndex(
                createPointConfig(mark, data, coords, readViewOpacity),
                resolvedPlacementIndex
            ),
        };
    } else if (markType == "rect") {
        return {
            definition: rectMark,
            config: addPlacementIndex(
                createRectConfig(mark, data, coords, readViewOpacity),
                resolvedPlacementIndex
            ),
        };
    } else if (markType == "rule" || markType == "tick") {
        return {
            definition: ruleMark,
            config: addPlacementIndex(
                createRuleConfig(mark, data, coords, readViewOpacity),
                resolvedPlacementIndex
            ),
        };
    } else if (markType == "text") {
        return {
            definition: textMark,
            config: addPlacementIndex(
                createTextConfig(mark, data, coords, readViewOpacity),
                resolvedPlacementIndex
            ),
        };
    } else if (markType == "link") {
        return {
            definition: linkMark,
            config: addPlacementIndex(
                createLinkConfig(mark, data, coords, readViewOpacity),
                resolvedPlacementIndex
            ),
        };
    } else if (markType == "arrow") {
        return {
            definition: arrowMark,
            config: addPlacementIndex(
                createArrowConfig(mark, data, coords, readViewOpacity),
                resolvedPlacementIndex
            ),
        };
    }

    throw unsupported(mark, `Mark type "${markType}" is not supported.`);
}

/**
 * Returns the revision of expression-backed data columns. Scale and property
 * leaves stay live and therefore do not participate in this revision.
 *
 * @param {import("../../marks/mark.js").default} mark
 */
export function getWebGpuMarkConfigRevision(mark) {
    return DYNAMIC_ENCODING_STATE.get(mark)?.revision ?? 0;
}

/**
 * Returns the revision of live scale, property, and selection resources.
 * Packed data and view opacity have separate revisions at the call site.
 * Undefined marks selection-backed resources that remain conservatively live.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @returns {number | undefined}
 */
export function getWebGpuMarkResourceRevision(mark) {
    const state = getResourceRevisionState(mark);
    return state.volatile ? undefined : state.revision;
}

/**
 * Packs a collector once in either its native batch order or the complete
 * placement topology order. Active occurrences never define packed topology.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../view/layout/placementSource.js").default} [placementSource]
 * @returns {PackedMarkData}
 */
export function getPackedMarkData(mark, placementSource) {
    const collector = mark.unitView.getCollector();
    if (!collector) {
        throw new Error(
            `Cannot render an uninitialized mark. View: ${mark.unitView.getPathString()}`
        );
    }

    const topology = placementSource?.getSnapshot().topology;
    const cached = PACKED_DATA_CACHE.get(mark);
    if (
        cached?.collector === collector &&
        cached.revision === collector.dataRevision &&
        cached.topology === topology
    ) {
        return cached;
    }

    const unFaceted = collector.facetBatches.get(undefined);
    /** @type {Map<object[], {firstInstance: number, instanceCount: number}>} */
    const ranges = new Map();
    /** @type {{firstInstance: number, instanceCount: number}[] | undefined} */
    let placementRanges;
    /** @type {object[]} */
    let data;

    if (unFaceted?.length) {
        data = unFaceted;
        ranges.set(unFaceted, {
            firstInstance: 0,
            instanceCount: data.length,
        });
    } else {
        const batches = topology
            ? topology.facetIds.map((facetId) =>
                  facetId
                      ? (collector.facetBatches.get(
                            /** @type {any} */ (facetId)
                        ) ?? [])
                      : []
              )
            : Array.from(collector.facetBatches.values());
        data = new Array(
            batches.reduce((total, batch) => total + batch.length, 0)
        );
        if (topology) {
            placementRanges = [];
        }
        let dataIndex = 0;
        for (const batch of batches) {
            const range = {
                firstInstance: dataIndex,
                instanceCount: batch.length,
            };
            placementRanges?.push(range);
            ranges.set(batch, range);
            for (const datum of batch) {
                data[dataIndex++] = datum;
            }
        }
    }

    const packed = {
        collector,
        revision: collector.dataRevision,
        topology,
        data,
        ranges,
        placementRanges,
    };
    PACKED_DATA_CACHE.set(mark, packed);
    return packed;
}

/**
 * Resolves an occurrence range when packed data changes.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @param {PackedMarkData} packed
 */
export function getPackedMarkRange(mark, options, packed) {
    const placementIndex = options.placement?.index;
    return (
        (placementIndex === undefined
            ? undefined
            : packed.placementRanges?.[placementIndex]) ??
        packed.ranges.get(getMarkData(mark, options)) ?? {
            firstInstance: 0,
            instanceCount: 0,
        }
    );
}

/** @param {object} config @param {unknown} placementIndex */
function addPlacementIndex(config, placementIndex) {
    return placementIndex ? { ...config, placementIndex } : config;
}

/** @param {import("../../marks/mark.js").default} mark @param {object[]} data */
function toPlacementIndexArray(mark, data) {
    const encoder = mark.encoders.facetIndex;
    const cached = PLACEMENT_INDEX_CACHE.get(mark);
    if (cached?.data === data && cached.encoder === encoder) {
        return cached.values;
    }
    const result = new Uint32Array(data.length);
    for (let index = 0; index < data.length; index++) {
        const value = Number(encoder(data[index]));
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
            throw unsupported(
                mark,
                "Facet indices must be non-negative integers."
            );
        }
        result[index] = value;
    }
    PLACEMENT_INDEX_CACHE.set(mark, { data, encoder, values: result });
    return result;
}

/**
 * @typedef {object} PackedMarkData
 * @property {import("../../data/collector.js").default} collector
 * @property {number} revision
 * @property {object | undefined} topology
 * @property {object[]} data
 * @property {Map<object[], {firstInstance: number, instanceCount: number}>} ranges
 * @property {{firstInstance: number, instanceCount: number}[] | undefined} placementRanges
 */

/**
 * Mark properties represented by channel value slots in the renderer.
 *
 * @param {string} markType
 * @returns {string[]}
 */
function getDynamicChannelProperties(markType) {
    if (markType == "point") {
        return ["fillGradientStrength", "inwardStroke"];
    } else if (markType == "rect") {
        return [
            "cornerRadius",
            "cornerRadiusTopRight",
            "cornerRadiusBottomRight",
            "cornerRadiusTopLeft",
            "cornerRadiusBottomLeft",
            "minWidth",
            "minHeight",
            "minOpacity",
            "shadowOffsetX",
            "shadowOffsetY",
            "shadowBlur",
            "shadowOpacity",
            "shadowColor",
            "hatch",
        ];
    } else if (markType == "rule" || markType == "tick") {
        return ["minLength", "strokeCap", "strokeDashOffset"];
    } else {
        return [];
    }
}

/**
 * Builds a channel from Core's ordered branches. Core permits at most one
 * non-constant branch, which matches the renderer's retained series model.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {(encoder: import("../../types/encoder.js").Encoder, branch: import("../../types/encoder.js").EncodingBranch) => any} build
 * @returns {any}
 */
function createConditionalChannel(mark, channel, data, build) {
    const encoder = requireEncoder(mark, channel);
    const branches = encoder.branches;
    const fallback = branches.at(-1);
    if (!fallback) {
        throw unsupported(mark, `Channel "${channel}" has no fallback branch.`);
    }

    const fallbackEncoder = createBranchEncoder(mark, encoder, fallback);
    const result = build(fallbackEncoder, fallback);
    if (branches.length == 1) {
        return result;
    }

    const conditions = branches.slice(0, -1).map((branch) => {
        const branchEncoder = createBranchEncoder(mark, encoder, branch);
        const branchConfig = build(branchEncoder, branch);
        const when = createSelectionCondition(mark, channel, branch.predicate);
        return { when, channel: branchConfig };
    });

    result.conditions = conditions;
    return result;
}

/**
 * Reconstructs the branch encoder metadata while retaining the raw accessor
 * for series-backed channel configs. Scales are applied by the low-level
 * channel config, just as they are for unconditional channels.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @param {import("../../types/encoder.js").EncodingBranch} branch
 * @returns {import("../../types/encoder.js").Encoder}
 */
function createBranchEncoder(mark, encoder, branch) {
    const accessor = branch.accessor;
    const scale = accessor.scaleChannel
        ? mark.unitView.getScaleResolution(accessor.scaleChannel)?.getScale()
        : encoder.scale;
    if (accessor.scaleChannel && !scale) {
        throw unsupported(
            mark,
            `Missing scale for conditional channel "${accessor.channel}".`
        );
    }

    return /** @type {import("../../types/encoder.js").Encoder} */ (
        Object.assign(
            /**
             * @param {any} datum
             */
            (datum) => accessor(datum),
            {
                constant: accessor.constant ?? encoder.constant,
                branches: [branch],
                scale,
                channelDef: accessor.channelDef ?? encoder.channelDef,
            }
        )
    );
}

/**
 * Converts a Core selection predicate to the renderer's selection contract.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").Predicate} predicate
 * @returns {import("@genome-spy/webgpu-renderer").SelectionPredicate}
 */
function createSelectionCondition(mark, channel, predicate) {
    if (!predicate.param) {
        throw unsupported(
            mark,
            `Conditional channel "${channel}" has no selection parameter.`
        );
    }

    const selection = mark.unitView.paramRuntime.findValue(predicate.param);
    if (
        !selection ||
        !["single", "multi", "interval"].includes(selection.type)
    ) {
        throw unsupported(
            mark,
            `Selection "${predicate.param}" is not available for WebGPU.`
        );
    }
    // Selections lack a complete change-notification contract. Keep the mark
    // conservatively dirty instead of building a second dependency graph here.
    // TODO: Use a selection revision once ParamRuntime exposes a complete
    // selection-change notification contract.
    getResourceRevisionState(mark).volatile = true;

    /** @type {import("@genome-spy/webgpu-renderer").SelectionPredicate} */
    const when = {
        selection: predicate.param,
        type: selection.type,
        empty: predicate.empty ?? true,
    };

    if (selection.type == "interval") {
        const intervalWhen =
            /** @type {import("@genome-spy/webgpu-renderer").SelectionPredicate & {type: "interval"}} */ (
                /** @type {unknown} */ (when)
            );
        intervalWhen.targets = Object.keys(selection.intervals).map((input) => {
            if (input != "x" && input != "y") {
                throw unsupported(
                    mark,
                    `Interval selection "${predicate.param}" has unsupported target "${String(input)}".`
                );
            }

            assertScalarIntervalInput(mark, predicate.param, input);

            const secondaryInput = getSecondaryChannel(input);
            const target = { input };
            if (mark.encoders[secondaryInput]) {
                assertScalarIntervalInput(
                    mark,
                    predicate.param,
                    secondaryInput
                );
                return {
                    ...target,
                    secondaryInput,
                    hitTest: mark.defaultHitTestMode,
                };
            }
            return target;
        });
        return intervalWhen;
    }

    return when;
}

/**
 * Large index and locus values use two packed u32 components in ordinary
 * rendering, but interval predicates currently require one scalar component.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} selectionName
 * @param {string} channel
 */
function assertScalarIntervalInput(mark, selectionName, channel) {
    const encoder = /** @type {Record<string, any>} */ (mark.encoders)[channel];
    const scale = encoder?.scale;
    if (
        scale &&
        (scale.type == "index" || scale.type == "locus") &&
        isLargeGenome(scale.domain().map(Number))
    ) {
        throw unsupported(
            mark,
            `Interval selection "${selectionName}" cannot target two-component channel "${channel}".`
        );
    }
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {() => number} viewOpacity
 * @returns {object}
 */
function createRectConfig(mark, data, coords, viewOpacity) {
    return {
        count: data.length,
        channels: {
            ...createUniqueIdChannel(mark, data),
            x: createPositionChannel(mark, "x", data, coords),
            x2: createPositionChannel(mark, "x2", data, coords),
            y: createPositionChannel(mark, "y", data, coords),
            y2: createPositionChannel(mark, "y2", data, coords),
            xOffset: createNumericChannel(mark, "xOffset", data),
            x2Offset: createNumericChannel(mark, "x2Offset", data),
            yOffset: createNumericChannel(mark, "yOffset", data),
            y2Offset: createNumericChannel(mark, "y2Offset", data),
            fill: createColorChannel(mark, "fill", data),
            stroke: createColorChannel(mark, "stroke", data),
            fillOpacity: createOpacityChannel(
                mark,
                "fillOpacity",
                data,
                viewOpacity
            ),
            strokeOpacity: createOpacityChannel(
                mark,
                "strokeOpacity",
                data,
                viewOpacity
            ),
            strokeWidth: createNumericChannel(mark, "strokeWidth", data),
            cornerRadiusTopRight: liveValue(
                () => readCornerRadii(mark).topRight
            ),
            cornerRadiusBottomRight: liveValue(
                () => readCornerRadii(mark).bottomRight
            ),
            cornerRadiusTopLeft: liveValue(() => readCornerRadii(mark).topLeft),
            cornerRadiusBottomLeft: liveValue(
                () => readCornerRadii(mark).bottomLeft
            ),
            minWidth: liveValue(() => readNumericProperty(mark, "minWidth")),
            minHeight: liveValue(() => readNumericProperty(mark, "minHeight")),
            minOpacity: liveValue(() =>
                readNumericProperty(mark, "minOpacity")
            ),
            shadowOffsetX: liveValue(() =>
                readOptionalNumericProperty(mark, "shadowOffsetX", 0)
            ),
            shadowOffsetY: liveValue(() =>
                readOptionalNumericProperty(mark, "shadowOffsetY", 0)
            ),
            shadowBlur: liveValue(() =>
                readOptionalNumericProperty(mark, "shadowBlur", 0)
            ),
            shadowOpacity: liveValue(
                () =>
                    readOptionalNumericProperty(mark, "shadowOpacity", 0) *
                    viewOpacity()
            ),
            shadowColor: liveValue(() =>
                toRgba(mark, readProperty(mark, "shadowColor") ?? "black")
            ),
            hatchPattern: liveValue(
                () => mapProperty(mark, "hatch", HATCH_CODES, "none"),
                "u32"
            ),
        },
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {() => number} viewOpacity
 * @returns {object}
 */
function createPointConfig(mark, data, coords, viewOpacity) {
    const visibility = createPointVisibilityConfig(mark, data);
    return {
        count: data.length,
        channels: {
            ...createUniqueIdChannel(mark, data),
            x: createPositionChannel(mark, "x", data, coords),
            y: createPositionChannel(mark, "y", data, coords),
            size: createNumericChannel(mark, "size", data),
            shape: createEnumChannel(mark, "shape", data, SHAPE_CODES),
            strokeWidth: createNumericChannel(mark, "strokeWidth", data),
            dx: createCombinedOffsetChannel(mark, "x", data),
            dy: createCombinedOffsetChannel(mark, "y", data),
            fill: createColorChannel(mark, "fill", data),
            stroke: createColorChannel(mark, "stroke", data),
            fillOpacity: createOpacityChannel(
                mark,
                "fillOpacity",
                data,
                viewOpacity
            ),
            strokeOpacity: createOpacityChannel(
                mark,
                "strokeOpacity",
                data,
                viewOpacity
            ),
            angle: createNumericChannel(mark, "angle", data),
            gradientStrength: liveValue(() =>
                readNumericProperty(mark, "fillGradientStrength")
            ),
            inwardStroke: liveValue(
                () => (readProperty(mark, "inwardStroke") ? 1 : 0),
                "u32"
            ),
        },
        ...visibility,
    };
}

/**
 * Translate Core point semantic zoom into the renderer's generic visibility
 * contract while keeping score sampling, zoom policy, and selection grammar in
 * Core.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @returns {object}
 */
function createPointVisibilityConfig(mark, data) {
    const encoder = /** @type {Record<string, any>} */ (mark.encoders)
        .semanticScore;
    if (!encoder) {
        return {};
    }
    assertUnconditional(mark, "semanticScore", encoder);
    if (encoder.constant) {
        return {};
    }

    const accessor = encoder.branches[0].accessor;
    const scoreData = toFloat32Array(mark, "semanticScore", data, accessor);
    const selections = createPointVisibilitySelections(mark);
    const scorePredicate = {
        compare: ">=",
        left: { input: "semanticScoreInput" },
        right: { slot: "semanticThreshold" },
    };
    const visibleWhen =
        selections.length > 0
            ? { any: [...selections, scorePredicate] }
            : scorePredicate;

    return {
        inputs: {
            semanticScoreInput: {
                data: scoreData,
                type: "f32",
            },
        },
        scalarSlots: {
            semanticThreshold: retainedValue(
                () =>
                    /** @type {import("../../marks/point.js").default} */ (
                        mark
                    ).getSemanticThreshold(),
                "f32"
            ),
        },
        visibleWhen,
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @returns {object[]}
 */
function createPointVisibilitySelections(mark) {
    if (!mark.encoders.uniqueId) {
        return [];
    }

    const selections = [];
    const names = new Set();
    for (const encoder of Object.values(
        /** @type {Record<string, any>} */ (mark.encoders)
    )) {
        for (const branch of encoder.branches ?? []) {
            const predicate = branch.predicate;
            if (!predicate?.param || names.has(predicate.param)) {
                continue;
            }
            const selection = createSelectionCondition(
                mark,
                "semanticScore",
                predicate
            );
            selections.push({ ...selection, empty: false });
            names.add(predicate.param);
        }
    }
    return selections;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {() => number} viewOpacity
 * @returns {object}
 */
function createRuleConfig(mark, data, coords, viewOpacity) {
    const strokeDash = readProperty(mark, "strokeDash");

    return {
        count: data.length,
        channels: {
            ...createUniqueIdChannel(mark, data),
            x: createPositionChannel(mark, "x", data, coords),
            x2: createPositionChannel(mark, "x2", data, coords),
            y: createPositionChannel(mark, "y", data, coords),
            y2: createPositionChannel(mark, "y2", data, coords),
            xOffset: createNumericChannel(mark, "xOffset", data),
            x2Offset: createNumericChannel(mark, "x2Offset", data),
            yOffset: createNumericChannel(mark, "yOffset", data),
            y2Offset: createNumericChannel(mark, "y2Offset", data),
            size: createNumericChannel(mark, "size", data),
            color: createColorChannel(mark, "color", data),
            opacity: createOpacityChannel(mark, "opacity", data, viewOpacity),
            minLength: liveValue(() => readNumericProperty(mark, "minLength")),
            strokeCap: liveValue(
                () => mapProperty(mark, "strokeCap", STROKE_CAP_CODES),
                "u32"
            ),
            strokeDashOffset: liveValue(() =>
                readNumericProperty(mark, "strokeDashOffset")
            ),
            strokeDash: { value: 0, type: "u32" },
        },
        dashPatterns: strokeDash == null ? null : [strokeDash],
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {() => number} viewOpacity
 * @returns {object}
 */
function createTextConfig(mark, data, coords, viewOpacity) {
    const size = readNumericEncoder(mark, "size", data[0]);
    const encoders = /** @type {Record<string, any>} */ (mark.encoders);
    const fontEntry = /** @type {any} */ (mark).font;
    return {
        count: data.length,
        channels: {
            ...createUniqueIdChannel(mark, data),
            x: createPositionChannel(mark, "x", data, coords),
            ...(mark.encoders.x2
                ? {
                      x2: createPositionChannel(mark, "x2", data, coords),
                  }
                : {}),
            y: createPositionChannel(mark, "y", data, coords),
            ...(mark.encoders.y2
                ? {
                      y2: createPositionChannel(mark, "y2", data, coords),
                  }
                : {}),
            text: createTextChannel(mark, data),
            size: createNumericChannel(mark, "size", data),
            angle: createNumericChannel(mark, "angle", data),
            dx: createCombinedOffsetChannel(mark, "x", data),
            dy: createCombinedOffsetChannel(mark, "y", data),
            ...(encoders.x2Offset
                ? { x2Offset: createNumericChannel(mark, "x2Offset", data) }
                : {}),
            ...(encoders.y2Offset
                ? { y2Offset: createNumericChannel(mark, "y2Offset", data) }
                : {}),
            align: {
                value: mapProperty(mark, "align", ALIGN_CODES),
                type: "u32",
            },
            baseline: {
                value: mapProperty(mark, "baseline", BASELINE_CODES),
                type: "u32",
            },
            fill: createColorChannel(mark, "color", data),
            opacity: createOpacityChannel(mark, "opacity", data, viewOpacity),
        },
        font: resolveFont(mark),
        ...(fontEntry?.metrics && fontEntry.bitmapUrl
            ? {
                  fontResource: {
                      metrics: fontEntry.metrics,
                      bitmap: fontEntry.bitmapUrl,
                  },
              }
            : {}),
        fontStyle: readProperty(mark, "fontStyle"),
        fontWeight: readProperty(mark, "fontWeight"),
        fontSize: size,
        viewport: [coords.x, coords.y, coords.x2, coords.y2],
        paddingX: readNumericProperty(mark, "paddingX"),
        paddingY: readNumericProperty(mark, "paddingY"),
        flushX: !!readProperty(mark, "flushX"),
        flushY: !!readProperty(mark, "flushY"),
        squeeze: !!readProperty(mark, "squeeze"),
        logoLetters: !!readProperty(mark, "logoLetters"),
        // The view rectangle can change while a retained mark is reused.
        dynamicValues: {
            uViewport: {
                value: [coords.x, coords.y, coords.x2, coords.y2],
            },
            ...createDynamicValues(mark, {
                paddingX: ["uPaddingX", (value) => value],
                paddingY: ["uPaddingY", (value) => value],
                flushX: ["uFlushX", (value) => (value ? 1 : 0)],
                flushY: ["uFlushY", (value) => (value ? 1 : 0)],
                squeeze: ["uSqueeze", (value) => (value ? 1 : 0)],
                logoLetters: ["uLogoLetters", (value) => (value ? 1 : 0)],
            }),
        },
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {() => number} viewOpacity
 * @returns {object}
 */
function createLinkConfig(mark, data, coords, viewOpacity) {
    return {
        count: data.length,
        channels: {
            ...createUniqueIdChannel(mark, data),
            x: createPositionChannel(mark, "x", data, coords),
            x2: createPositionChannel(mark, "x2", data, coords),
            y: createPositionChannel(mark, "y", data, coords),
            y2: createPositionChannel(mark, "y2", data, coords),
            xOffset: createNumericChannel(mark, "xOffset", data),
            x2Offset: createNumericChannel(mark, "x2Offset", data),
            yOffset: createNumericChannel(mark, "yOffset", data),
            y2Offset: createNumericChannel(mark, "y2Offset", data),
            size: createNumericChannel(mark, "size", data),
            color: createColorChannel(mark, "color", data),
            opacity: createOpacityChannel(mark, "opacity", data, viewOpacity),
        },
        linkShape: mapProperty(mark, "linkShape", LINK_SHAPE_CODES, "arc"),
        orient: mapProperty(mark, "orient", ORIENT_CODES, "vertical"),
        arcFadingDistance: readDistancePair(mark, "arcFadingDistance"),
        arcHeightFactor: readOptionalNumericProperty(
            mark,
            "arcHeightFactor",
            1
        ),
        minArcHeight: readOptionalNumericProperty(mark, "minArcHeight", 1.5),
        clampApex: !!readProperty(mark, "clampApex"),
        maxChordLength: readOptionalNumericProperty(
            mark,
            "maxChordLength",
            50000
        ),
        segments: readOptionalNumericProperty(mark, "segments", 101),
        dynamicValues: createDynamicValues(mark, {
            arcFadingDistance: [
                "uArcFadingDistance",
                (value) => value ?? [0, 0],
            ],
            arcHeightFactor: ["uArcHeightFactor", (value) => value],
            minArcHeight: ["uMinArcHeight", (value) => value],
            linkShape: [
                "uShape",
                () => mapProperty(mark, "linkShape", LINK_SHAPE_CODES, "arc"),
            ],
            orient: [
                "uOrient",
                () => mapProperty(mark, "orient", ORIENT_CODES, "vertical"),
            ],
            clampApex: ["uClampApex", (value) => (value ? 1 : 0)],
            maxChordLength: ["uMaxChordLength", (value) => value],
            segments: ["uSegmentBreaks", (value) => Math.round(value)],
        }),
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {() => number} viewOpacity
 * @returns {object}
 */
function createArrowConfig(mark, data, coords, viewOpacity) {
    const headAngle = readOptionalNumericProperty(mark, "headAngle", 45);
    const headNotchAngle = readOptionalNumericProperty(
        mark,
        "headNotchAngle",
        90
    );
    return {
        count: data.length,
        channels: {
            ...createUniqueIdChannel(mark, data),
            x: createPositionChannel(mark, "x", data, coords),
            x2: createPositionChannel(mark, "x2", data, coords),
            y: createPositionChannel(mark, "y", data, coords),
            y2: createPositionChannel(mark, "y2", data, coords),
            xOffset: createNumericChannel(mark, "xOffset", data),
            x2Offset: createNumericChannel(mark, "x2Offset", data),
            yOffset: createNumericChannel(mark, "yOffset", data),
            y2Offset: createNumericChannel(mark, "y2Offset", data),
            fill: createColorChannel(mark, "fill", data),
            stroke: createColorChannel(mark, "stroke", data),
            fillOpacity: createOpacityChannel(
                mark,
                "fillOpacity",
                data,
                viewOpacity
            ),
            strokeOpacity: createOpacityChannel(
                mark,
                "strokeOpacity",
                data,
                viewOpacity
            ),
            strokeWidth: createNumericChannel(mark, "strokeWidth", data),
            size: createNumericChannel(mark, "size", data),
            direction: createEnumChannel(
                mark,
                "direction",
                data,
                ARROW_DIRECTION_CODES
            ),
        },
        headAngle: headAngleToSlope(headAngle),
        headNotchAngle: headAngleToSlope(headNotchAngle),
        minSize: readOptionalNumericProperty(mark, "minSize", 1),
        headWidth: readOptionalNumericProperty(mark, "headWidth", 3),
        startNotch: readProperty(mark, "startNotch") ? 1 : 0,
        minStemLength: readOptionalNumericProperty(mark, "minStemLength", 0),
        headSpacing: readNullableNumericProperty(mark, "headSpacing"),
        stem: readProperty(mark, "stem") !== false ? 1 : 0,
        headShape: mapProperty(
            mark,
            "headShape",
            ARROW_HEAD_SHAPE_CODES,
            "triangle"
        ),
        headPlacement: mapProperty(
            mark,
            "headPlacement",
            ARROW_HEAD_PLACEMENT_CODES,
            "inside"
        ),
        dynamicValues: createDynamicValues(mark, {
            headAngle: ["uHeadSlope", (value) => headAngleToSlope(value)],
            headNotchAngle: [
                "uHeadNotchSlope",
                (value) => headAngleToSlope(value),
            ],
            minSize: ["uMinSize", (value) => value],
            headWidth: ["uHeadWidth", (value) => value],
            startNotch: ["uStartNotch", (value) => (value ? 1 : 0)],
            minStemLength: ["uMinStemLength", (value) => value],
            headSpacing: ["uHeadSpacing", (value) => value ?? -1],
            stem: ["uStem", (value) => (value === false ? 0 : 1)],
            headShape: [
                "uHeadShape",
                () =>
                    mapProperty(
                        mark,
                        "headShape",
                        ARROW_HEAD_SHAPE_CODES,
                        "triangle"
                    ),
            ],
            headPlacement: [
                "uHeadPlacement",
                () =>
                    mapProperty(
                        mark,
                        "headPlacement",
                        ARROW_HEAD_PLACEMENT_CODES,
                        "inside"
                    ),
            ],
        }),
    };
}

/**
 * Core's generic sans-serif default is normalized to Lato by its font manager.
 * The loaded metrics and atlas are passed separately so the renderer does not
 * need to duplicate Core's font-loading and fallback policy.
 *
 * @param {import("../../marks/mark.js").default} mark
 */
function resolveFont(mark) {
    const font = readProperty(mark, "font");
    if (font == null || font == "sans-serif") {
        return "Lato";
    }
    if (typeof font == "string") {
        return font;
    }
    throw unsupported(mark, `Font "${String(font)}" is not supported.`);
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {"x" | "x2" | "y" | "y2"} channel
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createPositionChannel(mark, channel, data, coords) {
    return createConditionalChannel(mark, channel, data, (encoder) =>
        createPositionBranch(mark, channel, data, coords, encoder)
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createPositionBranch(mark, channel, data, coords, encoder) {
    const range = getAbsoluteRange(channel, coords, encoder.scale);
    if (encoder.constant) {
        return Object.assign(
            liveValue(() => {
                const rawValue = encoder.branches[0].accessor(data[0]);
                const unitPosition = Number(
                    encoder.scale
                        ? /** @type {any} */ (encoder.scale)(rawValue)
                        : encoder(data[0])
                );
                if (!Number.isFinite(unitPosition)) {
                    throw unsupported(
                        mark,
                        `Channel "${channel}" is not finite.`
                    );
                }
                return range[0] + unitPosition * (range[1] - range[0]);
            }),
            { scale: identityScale() }
        );
    }

    const accessor = encoder.branches[0].accessor;
    if (encoder.scale?.type == "band" || encoder.scale?.type == "point") {
        const { values, readDomain } = toCategoricalArray(
            mark,
            channel,
            data,
            accessor,
            encoder.scale
        );
        return {
            data: values,
            type: "u32",
            scale: createBandPositionScale(
                encoder.scale,
                range,
                readDomain,
                /** @type {import("../../spec/channel.js").BandMixins} */ (
                    accessor.channelDef
                ).band ?? 0.5
            ),
        };
    } else if (encoder.scale?.type == "ordinal") {
        const { values, readDomain } = toCategoricalArray(
            mark,
            channel,
            data,
            accessor,
            encoder.scale
        );
        return {
            data: values,
            type: "u32",
            scale: createOrdinalPositionScale(encoder.scale, range, readDomain),
        };
    } else if (
        encoder.scale?.type == "index" ||
        encoder.scale?.type == "locus"
    ) {
        const large = isLargeGenome(encoder.scale.domain().map(Number));
        return {
            data: toIndexArray(mark, channel, data, accessor, large),
            type: "u32",
            ...(large ? { inputComponents: 2 } : {}),
            scale: createIndexPositionScale(
                encoder.scale,
                range,
                /** @type {import("../../spec/channel.js").BandMixins} */ (
                    accessor.channelDef
                ).band ?? 0.5
            ),
        };
    }

    const values = toFloat32Array(mark, channel, data, accessor);
    return {
        data: values,
        type: "f32",
        scale: createPositionScale(mark, channel, encoder.scale, range),
    };
}

/**
 * @param {import("../../types/encoder.js").VegaScale} scale
 * @param {[number, number]} range
 * @param {() => number[]} readDomain
 * @param {number} band
 */
function createBandPositionScale(scale, range, readDomain, band) {
    const configurableScale = /** @type {any} */ (scale);
    return retainScaleLeaves(
        bandScale({
            domain: readDomain(),
            range,
            paddingInner:
                scale.type == "point" ? 1 : configurableScale.paddingInner(),
            paddingOuter: configurableScale.paddingOuter(),
            align: configurableScale.align(),
            band,
        }),
        readDomain
    );
}

/**
 * Core represents ordinal positional ranges in unit coordinates. Convert
 * those outputs to the absolute logical-pixel range used by WebGPU.
 *
 * @param {import("../../types/encoder.js").VegaScale} scale
 * @param {[number, number]} range
 * @param {() => number[]} readDomain
 */
function createOrdinalPositionScale(scale, range, readDomain) {
    const readRange = () =>
        scale
            .range()
            .map((value) => range[0] + Number(value) * (range[1] - range[0]));
    return retainScaleLeaves(
        ordinalScale({
            domain: readDomain(),
            range: readRange(),
        }),
        readDomain,
        readRange
    );
}

/**
 * @param {import("../../types/encoder.js").VegaScale} scale
 * @param {[number, number]} range
 * @param {number} band
 */
function createIndexPositionScale(scale, range, band) {
    const configurableScale = /** @type {any} */ (scale);
    return retainScaleLeaves(
        indexScale({
            domain: scale.domain().map(Number),
            range,
            paddingInner: configurableScale.paddingInner(),
            paddingOuter: configurableScale.paddingOuter(),
            align: configurableScale.align(),
            band,
        }),
        () => scale.domain().map(Number)
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createNumericChannel(mark, channel, data) {
    return createConditionalChannel(mark, channel, data, (encoder) =>
        createNumericBranch(mark, channel, data, encoder)
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createNumericBranch(mark, channel, data, encoder) {
    if (encoder.constant) {
        return liveValue(() => Number(encoder(data[0])));
    }

    const accessor = encoder.branches[0].accessor;
    if (
        encoder.scale?.type == "ordinal" ||
        encoder.scale?.type == "band" ||
        encoder.scale?.type == "point"
    ) {
        const { values, readDomain } = toCategoricalArray(
            mark,
            channel,
            data,
            accessor,
            encoder.scale
        );
        return {
            data: values,
            type: "u32",
            scale:
                encoder.scale.type == "ordinal"
                    ? createNonPositionalScale(
                          mark,
                          channel,
                          encoder.scale,
                          1,
                          readDomain
                      )
                    : createBandPositionScale(
                          encoder.scale,
                          /** @type {[number, number]} */ (
                              encoder.scale.range()
                          ),
                          readDomain,
                          0.5
                      ),
        };
    }
    const config = {
        data: toFloat32Array(mark, channel, data, accessor),
        type: /** @type {const} */ ("f32"),
    };
    const scale = createNonPositionalScale(mark, channel, encoder.scale);
    return scale ? { ...config, scale } : config;
}

/**
 * Applies view opacity after channel scaling by multiplying numeric scale
 * ranges. Unscaled series are multiplied while materializing the column.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {() => number} viewOpacity
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createOpacityChannel(mark, channel, data, viewOpacity) {
    return createConditionalChannel(mark, channel, data, (encoder) =>
        createOpacityBranch(mark, channel, data, viewOpacity, encoder)
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {() => number} viewOpacity
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createOpacityBranch(mark, channel, data, viewOpacity, encoder) {
    if (encoder.constant) {
        return liveValue(() => Number(encoder(data[0])) * viewOpacity());
    }

    const accessor = encoder.branches[0].accessor;
    if (encoder.scale?.type == "ordinal") {
        const { values, readDomain } = toCategoricalArray(
            mark,
            channel,
            data,
            accessor,
            encoder.scale
        );
        return {
            data: values,
            type: "u32",
            scale: createNonPositionalScale(
                mark,
                channel,
                encoder.scale,
                viewOpacity,
                readDomain
            ),
        };
    }
    const scale =
        encoder.scale?.type == "identity"
            ? undefined
            : createNonPositionalScale(
                  mark,
                  channel,
                  encoder.scale,
                  viewOpacity
              );
    if (scale) {
        return {
            data: toFloat32Array(mark, channel, data, accessor),
            type: "f32",
            scale,
        };
    }

    return {
        data: toFloat32Array(mark, channel, data, accessor),
        type: "f32",
        scale: retainScaleLeaves(
            linearScale({ domain: [0, 1], range: [0, viewOpacity()] }),
            undefined,
            () => [0, viewOpacity()]
        ),
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {Map<string, number>} values
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createEnumChannel(mark, channel, data, values) {
    return createConditionalChannel(mark, channel, data, (encoder) =>
        createEnumBranch(mark, channel, data, values, encoder)
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {Map<string, number>} values
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createEnumBranch(mark, channel, data, values, encoder) {
    if (encoder.constant) {
        return liveValue(
            () => getEnumValue(mark, channel, values, encoder(data[0])),
            "u32"
        );
    }

    const accessor = encoder.branches[0].accessor;
    if (encoder.scale?.type == "ordinal") {
        const { values: categoryValues, readDomain } = toCategoricalArray(
            mark,
            channel,
            data,
            accessor,
            encoder.scale
        );
        return {
            data: categoryValues,
            type: "u32",
            scale: retainScaleLeaves(
                ordinalScale({
                    domain: readDomain(),
                    range: encoder.scale
                        .range()
                        .map((value) =>
                            getEnumValue(mark, channel, values, value)
                        ),
                }),
                readDomain,
                () =>
                    encoder.scale
                        .range()
                        .map((value) =>
                            getEnumValue(mark, channel, values, value)
                        )
            ),
        };
    }

    if (encoder.scale?.type == "threshold") {
        return {
            data: toFloat32Array(mark, channel, data, accessor),
            type: "f32",
            scale: retainScaleLeaves(
                thresholdScale({
                    domain: encoder.scale.domain().map(Number),
                    range: createEnumThresholdRange(
                        mark,
                        channel,
                        values,
                        encoder.scale
                    ),
                }),
                () => encoder.scale.domain().map(Number),
                () =>
                    createEnumThresholdRange(
                        mark,
                        channel,
                        values,
                        encoder.scale
                    )
            ),
        };
    }

    return {
        data: getCachedSeries(mark, channel, data, accessor, () =>
            Uint32Array.from(data, (datum) =>
                getEnumValue(mark, channel, values, accessor(datum))
            )
        ),
        type: "u32",
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createColorChannel(mark, channel, data) {
    return createConditionalChannel(mark, channel, data, (encoder) =>
        createColorBranch(mark, channel, data, encoder)
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createColorBranch(mark, channel, data, encoder) {
    if (encoder.constant) {
        return liveValue(() => toRgba(mark, encoder(data[0])));
    }

    const accessor = encoder.branches[0].accessor;
    const scale = encoder.scale;
    if (!scale) {
        return {
            data: getCachedSeries(mark, channel, data, accessor, () => {
                const colors = new Float32Array(data.length * 4);
                data.forEach((datum, index) => {
                    colors.set(toRgba(mark, accessor(datum)), index * 4);
                });
                return colors;
            }),
            type: "f32",
            inputComponents: 4,
        };
    }

    if (scale.type == "ordinal") {
        const { values, readDomain } = toCategoricalArray(
            mark,
            channel,
            data,
            accessor,
            scale
        );
        return {
            data: values,
            type: "u32",
            inputComponents: 1,
            scale: createColorScale(mark, channel, scale, readDomain),
        };
    }

    return {
        data: toFloat32Array(mark, channel, data, accessor),
        type: "f32",
        inputComponents: 1,
        scale: createColorScale(mark, channel, scale),
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").VegaScale} scale
 * @param {(() => number[])} [readOrdinalDomain]
 */
function createColorScale(mark, channel, scale, readOrdinalDomain) {
    const configurableScale = /** @type {any} */ (scale);
    if (scale.type == "ordinal") {
        return retainScaleLeaves(
            ordinalScale({
                domain: readOrdinalDomain?.(),
                range: scale.range(),
            }),
            readOrdinalDomain,
            () => scale.range()
        );
    } else if (
        scale.type == "sequential-linear" ||
        scale.type == "diverging-linear"
    ) {
        return retainScaleLeaves(
            linearScale({
                domain: getInterpolatorDomain(scale),
                range: configurableScale.interpolator(),
                clamp: configurableScale.clamp(),
            }),
            () => getInterpolatorDomain(scale),
            () => configurableScale.interpolator()
        );
    } else if (scale.type == "sequential-log") {
        return retainScaleLeaves(
            logScale({
                domain: getInterpolatorDomain(scale),
                range: configurableScale.interpolator(),
                base: configurableScale.base(),
                clamp: configurableScale.clamp(),
            }),
            () => getInterpolatorDomain(scale),
            () => configurableScale.interpolator()
        );
    } else if (scale.type == "linear") {
        return retainScaleLeaves(
            linearScale({
                domain: scale.domain().map(Number),
                range: scale.range(),
                interpolate: configurableScale.interpolate(),
                clamp: configurableScale.clamp(),
            }),
            () => scale.domain().map(Number),
            () => scale.range()
        );
    } else if (scale.type == "threshold") {
        return retainScaleLeaves(
            thresholdScale({
                domain: scale.domain().map(Number),
                range: normalizeColorRange(mark, scale.range()),
            }),
            () => scale.domain().map(Number),
            () => normalizeColorRange(mark, scale.range())
        );
    } else if (scale.type == "quantize") {
        return retainScaleLeaves(
            quantizeScale({
                domain: scale.domain().map(Number),
                range: normalizeColorRange(mark, scale.range()),
            }),
            () => scale.domain().map(Number),
            () => normalizeColorRange(mark, scale.range())
        );
    }

    throw unsupported(
        mark,
        `Scale type "${scale.type}" on channel "${channel}" is not supported.`
    );
}

/**
 * Materialize Core's CSS colors for discrete renderer scales. The renderer
 * also accepts CSS strings, but passing normalized vectors keeps the scale
 * output contract explicit for four-component mark channels.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {Array<number | number[] | string>} range
 */
function normalizeColorRange(mark, range) {
    return range.map((value) =>
        typeof value == "string" ? toRgba(mark, value) : value
    );
}

/** @param {import("../../types/encoder.js").VegaScale} scale */
function getInterpolatorDomain(scale) {
    const domain = scale.domain().map(Number);
    return [domain[0], domain.at(-1)];
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @returns {import("@genome-spy/webgpu-renderer").TextStringChannelConfigInput}
 */
function createTextChannel(mark, data) {
    const encoder = requireEncoder(mark, "text");
    assertUnconditional(mark, "text", encoder);
    const channelDef = encoder.channelDef;
    const formatValue =
        "format" in channelDef
            ? numberFormat(channelDef.format)
            : (/** @type {any} */ d) => d;
    /** @param {object} datum */
    const stringify = (datum) => {
        const value = formatValue(encoder(datum));
        return value == null ? "" : String(value);
    };
    return encoder.constant
        ? { value: stringify(data[0]) }
        : {
              data: getCachedSeries(
                  mark,
                  "text",
                  data,
                  encoder.branches[0].accessor,
                  () => data.map(stringify)
              ),
          };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {"x" | "y"} axis
 * @param {object[]} data
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createCombinedOffsetChannel(mark, axis, data) {
    const legacyChannel = axis == "x" ? "dx" : "dy";
    const legacy = mark.encoders[legacyChannel];
    if (legacy) {
        assertUnconditional(mark, legacyChannel, legacy);
    }
    if (legacy && legacy.branches.length != 1) {
        throw unsupported(
            mark,
            `Conditional channel "${legacyChannel}" is not supported.`
        );
    }

    const propertyValue = legacy ? 0 : readNumericProperty(mark, legacyChannel);
    return createConditionalChannel(
        mark,
        axis + "Offset",
        data,
        (branchEncoder) => {
            /** @param {object} datum */
            const read = (datum) =>
                Number(branchEncoder(datum)) +
                (legacy ? Number(legacy(datum)) : propertyValue);

            if (branchEncoder.constant && (!legacy || legacy.constant)) {
                return liveValue(() => read(data[0]));
            }
            return {
                data: Float32Array.from(data, read),
                type: "f32",
            };
        }
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object} datum
 */
function readNumericEncoder(mark, channel, datum) {
    const encoder = requireEncoder(mark, channel);
    const value = Number(encoder(datum));
    if (!Number.isFinite(value)) {
        throw unsupported(mark, `Channel "${channel}" is not finite.`);
    }
    return value;
}

/**
 * Temporary unit-to-logical-pixel range shim. Delete this function when Core
 * positional encoders use pixel ranges.
 *
 * @param {string} channel
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {import("../../types/encoder.js").VegaScale | undefined} scale
 * @returns {[number, number]}
 */
function getAbsoluteRange(channel, coords, scale) {
    if (channel[0] == "x") {
        return [coords.x, coords.x2];
    }

    // Core's default y range is descending in pixel space. The reverse flag
    // flips that range for both continuous and discrete scales.
    const reverse =
        /** @type {{ props?: { reverse?: boolean } } | undefined} */ (
            /** @type {unknown} */ (scale)
        )?.props?.reverse;
    return reverse ? [coords.y, coords.y2] : [coords.y2, coords.y];
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").VegaScale | undefined} scale
 * @param {[number, number]} range
 * @returns {import("@genome-spy/webgpu-renderer").ConfiguredScale<"linear">}
 */
function createPositionScale(mark, channel, scale, range) {
    if (!scale || scale.type == "null") {
        return linearScale({ domain: [0, 1], range });
    }
    return createNumericScale(mark, channel, scale, range);
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").VegaScale | undefined} scale
 * @param {number | (() => number)} [rangeMultiplier]
 * @param {number[] | (() => number[])} [domain]
 * @returns {import("@genome-spy/webgpu-renderer").ConfiguredScale<"identity" | "linear"> | undefined}
 */
function createNonPositionalScale(
    mark,
    channel,
    scale,
    rangeMultiplier = 1,
    domain
) {
    if (!scale || scale.type == "null") {
        return undefined;
    }
    if (scale.type == "identity") {
        return identityScale();
    }
    const readRangeMultiplier =
        typeof rangeMultiplier == "function"
            ? rangeMultiplier
            : () => rangeMultiplier;
    return createNumericScale(
        mark,
        channel,
        scale,
        () =>
            scale.range().map((value) => Number(value) * readRangeMultiplier()),
        domain
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").VegaScale} scale
 * @param {number[] | (() => number[])} range
 * @param {number[] | (() => number[])} [domain]
 * @returns {import("@genome-spy/webgpu-renderer").ConfiguredScale<any>}
 */
function createNumericScale(mark, channel, scale, range, domain) {
    const configurableScale = /** @type {any} */ (scale);
    const readDomain =
        typeof domain == "function"
            ? domain
            : domain
              ? () => domain
              : () => scale.domain().map(Number);
    const readRange = typeof range == "function" ? range : () => range;
    const options = /** @type {Record<string, any>} */ ({
        domain: readDomain(),
        range: readRange(),
        clamp: getScaleProperty(configurableScale, "clamp", false),
    });
    const round = getScaleProperty(configurableScale, "round", false);
    if (round) {
        options.round = true;
    }

    let configured;
    switch (scale.type) {
        case "linear":
        case "sequential-linear":
        case "diverging-linear":
            configured = linearScale(options);
            break;
        case "log":
            configured = logScale({
                ...options,
                base: getScaleProperty(configurableScale, "base", 10),
            });
            break;
        case "pow":
            configured = powScale({
                ...options,
                exponent: getScaleProperty(configurableScale, "exponent", 1),
            });
            break;
        case "sqrt":
            configured = sqrtScale(options);
            break;
        case "symlog":
            configured = symlogScale({
                ...options,
                constant: getScaleProperty(configurableScale, "constant", 1),
            });
            break;
        case "quantize":
            configured = quantizeScale(options);
            break;
        case "threshold":
            configured = thresholdScale(options);
            break;
        case "ordinal":
            configured = ordinalScale(options);
            break;
        default:
            throw unsupported(
                mark,
                `Scale type "${scale.type}" on channel "${channel}" is not supported.`
            );
    }
    return retainScaleLeaves(configured, readDomain, readRange);
}

/**
 * Keeps a renderer scale's updateable leaves connected to its Core source.
 *
 * @param {import("@genome-spy/webgpu-renderer").DefinedChannelScale} scale
 * @param {(() => number[])} [readDomain]
 * @param {(() => any)} [readRange]
 */
function retainScaleLeaves(scale, readDomain, readRange) {
    Object.defineProperties(scale, {
        ...(readDomain
            ? {
                  domain: {
                      enumerable: true,
                      get: readDomain,
                  },
              }
            : {}),
        ...(readRange
            ? {
                  range: {
                      enumerable: true,
                      get: readRange,
                  },
              }
            : {}),
    });
    return scale;
}

/**
 * @param {Record<string, any>} scale
 * @param {string} property
 * @param {any} fallback
 */
function getScaleProperty(scale, property, fallback) {
    const value = scale[property];
    return typeof value == "function" ? value() : (value ?? fallback);
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {Map<string, number>} values
 * @param {unknown} raw
 */
function getEnumValue(mark, channel, values, raw) {
    const value = values.get(String(raw));
    if (value === undefined) {
        throw unsupported(mark, `Unsupported ${channel}: ${String(raw)}`);
    }
    return value;
}

/**
 * Core's configurable default shape range has five entries, while a
 * threshold with five domain breaks needs six slots. WebGL reuses the final
 * range entry for the open-ended last bucket; make that compatibility explicit.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {Map<string, number>} values
 * @param {import("../../types/encoder.js").VegaScale} scale
 */
function createEnumThresholdRange(mark, channel, values, scale) {
    const domain = scale.domain();
    const range = scale
        .range()
        .map((value) => getEnumValue(mark, channel, values, value));
    while (range.length < domain.length + 1) {
        range.push(range.at(-1));
    }
    return range;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @returns {Record<string, import("@genome-spy/webgpu-renderer").ChannelConfigInput>}
 */
function createUniqueIdChannel(mark, data) {
    const encoder = mark.encoders.uniqueId;
    if (!encoder) {
        return {};
    }
    assertUnconditional(mark, "uniqueId", encoder);
    if (encoder.constant) {
        return {
            uniqueId: liveValue(
                () => readUnsignedInteger(mark, "uniqueId", encoder(data[0])),
                "u32"
            ),
        };
    }

    const accessor = encoder.branches[0].accessor;
    return {
        uniqueId: {
            data: getCachedSeries(mark, "uniqueId", data, accessor, () =>
                Uint32Array.from(data, (datum) =>
                    readUnsignedInteger(mark, "uniqueId", accessor(datum))
                )
            ),
            type: "u32",
        },
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {unknown} raw
 */
function readUnsignedInteger(mark, channel, raw) {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
        throw unsupported(
            mark,
            `Channel "${channel}" must contain u32 integers.`
        );
    }
    return value;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @returns {import("../../types/encoder.js").Encoder}
 */
function requireEncoder(mark, channel) {
    const encoder =
        /** @type {Record<string, import("../../types/encoder.js").Encoder | undefined>} */ (
            mark.encoders
        )[channel];
    if (!encoder) {
        throw unsupported(mark, `Missing encoder for channel "${channel}".`);
    }
    return encoder;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").Encoder} encoder
 */
function assertUnconditional(mark, channel, encoder) {
    if (encoder.branches.length != 1) {
        throw unsupported(
            mark,
            `Conditional channel "${channel}" is not supported.`
        );
    }
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Accessor} accessor
 */
function toFloat32Array(mark, channel, data, accessor) {
    return getCachedSeries(mark, channel, data, accessor, () =>
        Float32Array.from(data, (datum) => {
            const value = Number(accessor(datum));
            if (!Number.isFinite(value) && !Number.isNaN(value)) {
                throw unsupported(
                    mark,
                    `Channel "${channel}" contains an infinite value.`
                );
            }
            return value;
        })
    );
}

/**
 * The renderer accepts Float64 index data as a request to pack each safe
 * integer into two u32 components. Always use that path so scale-domain updates
 * cannot change the series representation.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Accessor} accessor
 * @param {boolean} large
 */
function toIndexArray(mark, channel, data, accessor, large) {
    const cacheChannel = `${channel}:${large ? "large" : "regular"}`;
    return getCachedSeries(mark, cacheChannel, data, accessor, () => {
        const values = Array.from(data, (datum) => {
            const rawValue = Number(accessor(datum));
            const value = Math.floor(rawValue);
            if (!Number.isSafeInteger(value) || value < 0) {
                throw unsupported(
                    mark,
                    `Channel "${channel}" must contain finite non-negative values within the safe integer range.`
                );
            }
            return value;
        });
        return large
            ? packHighPrecisionU32Array(values)
            : Uint32Array.from(values);
    });
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Accessor} accessor
 * @param {import("../../types/encoder.js").VegaScale} scale
 */
function toCategoricalArray(mark, channel, data, accessor, scale) {
    const indexer = /** @type {any} */ (scale).props?.domainIndexer;
    /** @param {import("../../spec/channel.js").Scalar} value */
    const intern = (value) =>
        readUnsignedInteger(mark, channel, indexer ? indexer(value) : value);

    const readDomain = () => scale.domain().map(intern);
    const values = getCachedSeries(mark, channel, data, accessor, () =>
        Uint32Array.from(data, (datum) => intern(accessor(datum)))
    );
    return { values, readDomain };
}

/**
 * @template {import("@genome-spy/webgpu-renderer").SeriesData} T
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Accessor} accessor
 * @param {() => T} create
 * @returns {T}
 */
function getCachedSeries(mark, channel, data, accessor, create) {
    if (!("field" in accessor.channelDef)) {
        return create();
    }

    let cache = SERIES_CACHE.get(mark);
    if (!cache || cache.data !== data) {
        cache = { data, channels: new Map() };
        SERIES_CACHE.set(mark, cache);
    }

    const cached = cache.channels.get(channel);
    if (cached?.accessor === accessor) {
        return /** @type {T} */ (cached.series);
    }

    const series = create();
    cache.channels.set(channel, { accessor, series });
    return series;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 */
function readNumericProperty(mark, property) {
    const value = readProperty(mark, property);
    if (typeof value != "number") {
        throw unsupported(
            mark,
            `Property "${property}" must be a number for the WebGPU renderer.`
        );
    }
    return value;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 * @param {number} fallback
 */
function readOptionalNumericProperty(mark, property, fallback) {
    const value = readProperty(mark, property) ?? fallback;
    if (typeof value != "number") {
        throw unsupported(
            mark,
            `Property "${property}" must be a number for the WebGPU renderer.`
        );
    }
    return value;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 * @returns {number | null}
 */
function readNullableNumericProperty(mark, property) {
    const value = readProperty(mark, property);
    if (value == null) {
        return null;
    }
    if (typeof value != "number") {
        throw unsupported(
            mark,
            `Property "${property}" must be a number for the WebGPU renderer.`
        );
    }
    return value;
}

/** @param {number} angle */
function headAngleToSlope(angle) {
    const clamped = Math.min(Math.max(angle, 1), 90);
    return 1 / Math.max(Math.tan((clamped * Math.PI) / 180), 1e-6);
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 * @returns {[number, number]}
 */
function readDistancePair(mark, property) {
    const value = readProperty(mark, property);
    if (value == null || value === false) {
        return [0, 0];
    }
    if (
        !Array.isArray(value) ||
        value.length != 2 ||
        !value.every((entry) => typeof entry == "number")
    ) {
        throw unsupported(mark, `Property "${property}" must be a pair.`);
    }
    return /** @type {[number, number]} */ (value);
}

/** @param {import("../../marks/mark.js").default} mark */
function readCornerRadii(mark) {
    const radius = readNumericProperty(mark, "cornerRadius");
    return {
        topRight: readOptionalNumericProperty(
            mark,
            "cornerRadiusTopRight",
            radius
        ),
        bottomRight: readOptionalNumericProperty(
            mark,
            "cornerRadiusBottomRight",
            radius
        ),
        topLeft: readOptionalNumericProperty(
            mark,
            "cornerRadiusTopLeft",
            radius
        ),
        bottomLeft: readOptionalNumericProperty(
            mark,
            "cornerRadiusBottomLeft",
            radius
        ),
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 * @param {Map<string, number>} values
 * @param {string} [fallback]
 */
function mapProperty(mark, property, values, fallback) {
    const raw = String(readProperty(mark, property) ?? fallback);
    const value = values.get(raw);
    if (value === undefined) {
        throw unsupported(mark, `Unsupported ${property}: ${raw}`);
    }
    return value;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 */
function readProperty(mark, property) {
    const value = /** @type {Record<string, any>} */ (mark.properties)[
        property
    ];
    return resolveMarkProperty(mark, value);
}

/**
 * Exposes a retained numeric leaf without rebuilding its surrounding config.
 *
 * @param {() => number | number[]} read
 * @param {import("@genome-spy/webgpu-renderer").ScalarType} [type]
 */
function liveValue(read, type) {
    return Object.assign(retainedValue(read, type), { dynamic: true });
}

/**
 * Exposes a retained numeric leaf that already has an explicit slot contract.
 *
 * @param {() => number | number[]} read
 * @param {import("@genome-spy/webgpu-renderer").ScalarType} [type]
 */
function retainedValue(read, type) {
    return {
        get value() {
            return read();
        },
        ...(type ? { type } : {}),
    };
}

/**
 * Converts expression-backed mark properties into retained extra-uniform
 * updates. The renderer already owns the uniform layout; Core only supplies
 * the WebGL-equivalent adjusted values.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {Record<string, [string, (value: any) => number | number[]]>} definitions
 * @returns {Record<string, {value: number | number[]}>}
 */
function createDynamicValues(mark, definitions) {
    watchDynamicProperties(mark, Object.keys(definitions));

    const dynamicValues =
        /** @type {Record<string, {value: number | number[]}>} */ ({});
    for (const [property, [uniform, adjust]] of Object.entries(definitions)) {
        const value = /** @type {Record<string, any>} */ (mark.properties)[
            property
        ];
        if (!isExprRef(value)) {
            continue;
        }
        dynamicValues[uniform] = retainedValue(() => {
            const adjusted = adjust(readProperty(mark, property));
            if (
                typeof adjusted != "number" &&
                (!Array.isArray(adjusted) ||
                    !adjusted.every((entry) => typeof entry == "number"))
            ) {
                throw unsupported(
                    mark,
                    `Dynamic property "${property}" must resolve to numeric data.`
                );
            }
            return adjusted;
        });
    }
    return dynamicValues;
}

/**
 * Invalidates retained series only when an expression dependency changes.
 * Field-backed columns remain tied solely to the collector revision.
 *
 * @param {import("../../marks/mark.js").default} mark
 */
function watchDynamicEncodings(mark) {
    let state = DYNAMIC_ENCODING_STATE.get(mark);
    if (!state) {
        state = { revision: 0, expressions: new Set() };
        DYNAMIC_ENCODING_STATE.set(mark, state);
    }

    for (const encoder of Object.values(
        /** @type {Record<string, any>} */ (mark.encoders)
    )) {
        for (const branch of encoder.branches ?? []) {
            const expression = branch.accessor.channelDef?.expr;
            if (
                typeof expression != "string" ||
                state.expressions.has(expression)
            ) {
                continue;
            }
            mark.unitView.paramRuntime.watchExpression(expression, () => {
                const current = DYNAMIC_ENCODING_STATE.get(mark);
                if (current) {
                    current.revision++;
                }
                mark.unitView.context.animator.requestRender();
            });
            state.expressions.add(expression);
        }
    }
}

/**
 * Registers one render invalidation watcher per expression-backed property.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {string[]} properties
 */
function watchDynamicProperties(mark, properties) {
    let watched = DYNAMIC_PROPERTY_WATCHES.get(mark);
    if (!watched) {
        watched = new Set();
        DYNAMIC_PROPERTY_WATCHES.set(mark, watched);
    }
    for (const property of properties) {
        if (watched.has(property)) {
            continue;
        }
        const value = /** @type {Record<string, any>} */ (mark.properties)[
            property
        ];
        if (isExprRef(value)) {
            mark.unitView.paramRuntime.watchExpression(value.expr, () => {
                getResourceRevisionState(mark).revision++;
                mark.unitView.context.animator.requestRender();
            });
        }
        watched.add(property);
    }
}

/**
 * Reuses Core's existing scale notifications as a small mark-level dirty bit.
 *
 * @param {import("../../marks/mark.js").default} mark
 */
function watchScaleResolutions(mark) {
    const state = getResourceRevisionState(mark);
    for (const [channel, encoder] of Object.entries(
        /** @type {Record<string, any>} */ (mark.encoders)
    )) {
        if (!encoder.scale) {
            continue;
        }
        const channelDef = findChannelDefWithScale(encoder.channelDef);
        const resolutionChannel =
            /** @type {import("../../spec/channel.js").Channel} */ (
                channelDef?.resolutionChannel ?? channel
            );
        if (!isChannelWithScale(resolutionChannel)) {
            continue;
        }
        const resolution = mark.unitView.getScaleResolution(resolutionChannel);
        if (!resolution || state.scaleResolutions.has(resolution)) {
            continue;
        }

        const listener = () => state.revision++;
        resolution.addEventListener("domain", listener);
        resolution.addEventListener("range", listener);
        mark.unitView.registerDisposer(() => {
            resolution.removeEventListener("domain", listener);
            resolution.removeEventListener("range", listener);
        });
        state.scaleResolutions.add(resolution);
    }
}

/** @param {import("../../marks/mark.js").default} mark */
function getResourceRevisionState(mark) {
    let state = RESOURCE_REVISION_STATE.get(mark);
    if (!state) {
        state = {
            revision: 0,
            scaleResolutions: new Set(),
            volatile: false,
        };
        RESOURCE_REVISION_STATE.set(mark, state);
    }
    return state;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {unknown} value
 * @returns {[number, number, number, number]}
 */
function toRgba(mark, value) {
    if (value == null) {
        return [0, 0, 0, 0];
    }
    const parsed = parseColor(String(value));
    if (!parsed) {
        throw unsupported(mark, `Invalid color: ${String(value)}`);
    }
    const rgb = parsed.rgb();
    return [rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.opacity];
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} message
 */
function unsupported(mark, message) {
    const error = new Error(
        `${message} Mark: ${mark.getType()}. View: ${mark.unitView.getPathString()}`
    );
    /** @type {any} */ (error).view = mark.unitView;
    return error;
}

/**
 * @typedef {object} ResourceRevisionState
 * @prop {number} revision
 * @prop {Set<import("../../scales/scaleResolution.js").default>} scaleResolutions
 * @prop {boolean} volatile
 */

/**
 * @typedef {object} SeriesCache
 * @prop {object[]} data
 * @prop {Map<string, {accessor: import("../../types/encoder.js").Accessor, series: import("@genome-spy/webgpu-renderer").SeriesData}>} channels
 */
