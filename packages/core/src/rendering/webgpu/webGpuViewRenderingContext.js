import { peek } from "../../utils/arrayUtils.js";
import ViewRenderingContext from "../../view/renderingContext/viewRenderingContext.js";
import {
    normalizeClipOptions,
    prepareMarkClipOptionsFromClip,
} from "../../view/renderingContext/clipOptions.js";
import { RASTER_COORDINATE_OFFSET } from "../renderingConstants.js";
import Rectangle from "../../view/layout/rectangle.js";
import {
    countPerformance,
    measurePerformance,
} from "../../debug/performanceProfiler.js";
import {
    createWebGpuMarkConfig,
    getWebGpuMarkConfigRevision,
    getWebGpuMarkResourceRevision,
} from "./webGpuMarkAdapter.js";
import {
    getPackedMarkData,
    getPackedMarkRange,
    queryPackedMarkXIndex,
} from "./webGpuMarkData.js";
import { resolveMarkXIndexQuery } from "../xIndex/markXIndex.js";

/**
 * Compiles a completed Core layout into an adapter-owned retained frame plan.
 */
export default class WebGpuViewRenderingContext extends ViewRenderingContext {
    /** @type {{view: import("../../view/view.js").default, coords: import("../../view/layout/rectangle.js").default}[]} */
    #viewStack = [];

    /** @type {Set<import("../../view/view.js").default>} */
    #views = new Set();

    /** @type {Map<import("../../marks/mark.js").default, MarkState>} */
    #marks = new Map();

    /** @type {Occurrence[]} */
    #occurrences = [];

    #finished = false;

    /**
     * @param {{surface: import("./webGpuSurface.js").default}} options
     */
    constructor(options) {
        super({});
        this.surface = options.surface;
    }

    getDevicePixelRatio() {
        return this.surface.getDevicePixelRatio();
    }

    /**
     * @param {import("../../view/view.js").default} view
     * @param {import("../../view/layout/rectangle.js").default} coords
     * @override
     */
    pushView(view, coords) {
        if (!this.#views.has(view)) {
            this.#views.add(view);
        }
        this.#viewStack.push({ view, coords });
    }

    /**
     * @param {import("../../view/view.js").default} view
     * @override
     */
    popView(view) {
        const entry = this.#viewStack.pop();
        if (entry?.view !== view) {
            throw new Error("Unbalanced WebGPU view rendering context stack.");
        }
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        if (this.#finished) {
            throw new Error("Cannot collect WebGPU marks after finishing.");
        }
        const coords = this.currentCoords;
        const markCoords = coords.translate(
            RASTER_COORDINATE_OFFSET,
            RASTER_COORDINATE_OFFSET
        );
        let state = this.#marks.get(mark);
        if (!state) {
            state = {
                mark,
                occurrences: [],
                packed: undefined,
                source: undefined,
                generatedSource: false,
                placementIndexed: mark.encoders?.facetIndex !== undefined,
                submittedPlacementIndexed: false,
                xQueryDomain: [0, 0],
                xIndexedRange: [0, 0],
                xQueryEnabled: false,
                updated: false,
                active: false,
                ownerCoords: undefined,
                definition: undefined,
                config: undefined,
                properties: undefined,
                configRevision: -1,
                resourceRevision: -1,
                viewOpacity: NaN,
                resourcesDirty: true,
                configX: NaN,
                configY: NaN,
                configWidth: NaN,
                configHeight: NaN,
                viewport: undefined,
                generatedRectangles: undefined,
            };
            this.#marks.set(mark, state);
        }

        const inheritedClip = normalizeClipOptions(options);
        /** @type {Occurrence} */
        const occurrence = {
            state,
            options,
            coords,
            markCoords,
            clip: prepareMarkClipOptionsFromClip(
                inheritedClip,
                mark.properties.clip,
                coords
            ),
            cullClip: inheritedClip,
            cull: mark.properties.cullByVisibleRange,
            range: { firstInstance: 0, instanceCount: 0 },
            placementIndex: state.occurrences.length,
            draw: undefined,
        };
        state.occurrences.push(occurrence);
        this.#occurrences.push(occurrence);
        countPerformance("markOccurrences");
    }

    /** Completes frame-plan compilation. */
    finish() {
        if (this.#finished) {
            throw new Error(
                "The WebGPU rendering context is already finished."
            );
        }
        if (this.#viewStack.length) {
            throw new Error("Cannot finish with an open WebGPU view scope.");
        }
        this.#finished = true;

        const size = this.surface.getLogicalCanvasSize();
        const canvas = Rectangle.create(0, 0, size.width, size.height);
        for (const state of this.#marks.values()) {
            this.#compileMarkState(state, canvas);
        }
    }

    /**
     * Synchronizes live state and submits occurrences in original paint order.
     *
     * @param {{picking: boolean}} options
     */
    render({ picking }) {
        if (!this.#finished) {
            throw new Error("Cannot render an unfinished WebGPU frame plan.");
        }

        for (const view of this.#views) {
            measurePerformance("onBeforeRender", () => view.onBeforeRender());
            countPerformance("viewsVisited");
        }

        const canvas = this.surface.getLogicalCanvasSize();
        for (const state of this.#marks.values()) {
            state.submittedPlacementIndexed = false;
            state.updated = false;
            state.active = false;
            this.#prepareMarkState(state, picking, canvas);
        }
        let synchronizedMarks = 0;
        let changedMarks = 0;
        let resourceWrites = 0;
        for (const occurrence of this.#occurrences) {
            const writes = this.#submitOccurrence(occurrence, picking, canvas);
            if (writes !== undefined) {
                synchronizedMarks++;
                changedMarks += writes > 0 ? 1 : 0;
                resourceWrites += writes;
            }
        }
        countPerformance("retainedMarkSyncChecks", synchronizedMarks);
        countPerformance("retainedMarkSyncChanges", changedMarks);
        countPerformance("retainedResourceWrites", resourceWrites);
    }

    /**
     * Resolves placement ownership that remains stable until the next layout.
     *
     * @param {MarkState} state
     * @param {Rectangle} canvas
     */
    #compileMarkState(state, canvas) {
        const explicitSources = new Set(
            state.occurrences
                .map((occurrence) => {
                    const placement = occurrence.options.placement;
                    return state.placementIndexed ||
                        placement?.index !== undefined
                        ? placement?.source
                        : undefined;
                })
                .filter(Boolean)
        );
        if (explicitSources.size > 1) {
            throw createViewError(
                state.mark,
                "One logical mark cannot use several placement sources."
            );
        }

        const resolvedSource = explicitSources.values().next().value;
        state.generatedSource = !resolvedSource && state.occurrences.length > 1;
        if (state.generatedSource) {
            const rectangles = (state.generatedRectangles = new Float32Array(
                state.occurrences.length * 4
            ));
            writeOccurrencePlacements(state, canvas, rectangles);
            state.source = this.surface.updateOccurrencePlacements(
                state.mark,
                rectangles
            );
            state.ownerCoords = canvas;
        } else {
            state.source = resolvedSource;
            state.ownerCoords = state.occurrences[0].markCoords;
        }

        if (state.placementIndexed && !state.source) {
            throw createViewError(
                state.mark,
                "Indexed placement requires a placement source."
            );
        }

        if (state.source) {
            state.viewport = createDrawRect();
        }
        for (const occurrence of state.occurrences) {
            occurrence.draw = createOccurrenceDraw(occurrence, state);
        }

        this.#validatePlacementTopology(state);
    }

    /**
     * @param {MarkState} state
     * @param {boolean} picking
     * @param {{width: number, height: number}} canvas
     */
    #prepareMarkState(state, picking, canvas) {
        if (state.generatedRectangles) {
            writeOccurrencePlacements(state, canvas, state.generatedRectangles);
            this.surface.updateOccurrencePlacements(
                state.mark,
                state.generatedRectangles
            );
        }
        if (state.viewport) {
            writeDrawRect(state.viewport, state.ownerCoords);
        }
        const viewOpacity = state.mark.unitView.getEffectiveOpacity();
        if (
            viewOpacity <= 0 ||
            (picking && !state.mark.isPickingParticipant())
        ) {
            return;
        }

        this.#validatePlacementTopology(state);

        const packed = getPackedMarkData(
            state.mark,
            state.generatedSource ? undefined : state.source
        );
        if (!packed.data.length) {
            return;
        }
        state.xQueryEnabled =
            !!packed.xIndexSpec &&
            resolveMarkXIndexQuery(
                state.mark,
                packed.xIndexSpec,
                state.xQueryDomain
            );
        if (!state.xQueryEnabled) {
            countPerformance("webgpuXIndexFallbackQueries");
        }

        const configRevision = getWebGpuMarkConfigRevision(state.mark);
        const packedChanged = state.packed !== packed;
        const expressionChanged = state.configRevision !== configRevision;
        // Positional channels are translated into the owner's coordinate
        // range when the config is created. Most owner rectangles are fixed
        // by layout, but chrome such as the SampleView scrollbar keeps a
        // stable Rectangle whose accessors change during interaction. The
        // WebGL path reevaluates that range for every draw; a retained WebGPU
        // config must be rebuilt when the numeric range changes.
        const configX = state.source ? 0 : state.ownerCoords.x;
        const configY = state.source ? 0 : state.ownerCoords.y;
        const configWidth = state.ownerCoords.width;
        const configHeight = state.ownerCoords.height;
        const geometryChanged =
            state.configX !== configX ||
            state.configY !== configY ||
            state.configWidth !== configWidth ||
            state.configHeight !== configHeight;
        if (packedChanged || expressionChanged || geometryChanged) {
            countPerformance(
                packedChanged
                    ? "markConfigurationPackedMiss"
                    : expressionChanged
                      ? "markConfigurationExpressionMiss"
                      : "markConfigurationGeometryMiss"
            );
            const first = state.occurrences[0];
            const configCoords = state.source
                ? Rectangle.create(
                      0,
                      0,
                      state.ownerCoords.width,
                      state.ownerCoords.height
                  )
                : state.ownerCoords;
            const translated = measurePerformance("markConfiguration", () =>
                createWebGpuMarkConfig(
                    state.mark,
                    first.options,
                    configCoords,
                    () => state.mark.unitView.getEffectiveOpacity(),
                    packed.data,
                    state.source && !state.placementIndexed
                        ? { source: "draw" }
                        : undefined
                )
            );
            state.packed = packed;
            state.definition = translated?.definition;
            state.config = translated?.config;
            state.properties = translated?.properties;
            state.configRevision = configRevision;
            state.configX = configX;
            state.configY = configY;
            state.configWidth = configWidth;
            state.configHeight = configHeight;
        }
        if (packedChanged) {
            for (const occurrence of state.occurrences) {
                occurrence.range = getPackedMarkRange(
                    state.mark,
                    occurrence.options,
                    packed
                );
            }
        }
        const resourceRevision = getWebGpuMarkResourceRevision(state.mark);
        state.resourcesDirty ||=
            resourceRevision === undefined ||
            packedChanged ||
            expressionChanged ||
            geometryChanged ||
            state.resourceRevision !== resourceRevision ||
            state.viewOpacity !== viewOpacity;
        state.resourceRevision = resourceRevision ?? -1;
        state.viewOpacity = viewOpacity;
        state.active = !!state.config;
    }

    /** @param {MarkState} state */
    #validatePlacementTopology(state) {
        if (!state.source || state.generatedSource) {
            return;
        }

        const topologyRevision = state.source.getSnapshot().topology.revision;
        for (const occurrence of state.occurrences) {
            const captured = occurrence.options.placement?.topologyRevision;
            if (captured !== undefined && captured !== topologyRevision) {
                throw createViewError(
                    state.mark,
                    "Placement topology changed after layout completion."
                );
            }
        }
    }

    /**
     * @param {Occurrence} occurrence
     * @param {boolean} picking
     * @param {{width: number, height: number}} canvas
     * @returns {number | undefined} Resource writes, or undefined when unchecked.
     */
    #submitOccurrence(occurrence, picking, canvas) {
        const state = occurrence.state;
        if (
            !state.active ||
            !state.config ||
            !state.definition ||
            !state.packed
        ) {
            return undefined;
        }
        if (state.placementIndexed && state.submittedPlacementIndexed) {
            return undefined;
        }

        const range = occurrence.range;
        if (!range.instanceCount) {
            return undefined;
        }

        const draw = occurrence.draw;
        if (!draw) {
            throw new Error("Occurrence draw has not been compiled.");
        }
        refreshOccurrenceDraw(occurrence, state, draw, canvas);

        const placementIndex = state.generatedSource
            ? occurrence.placementIndex
            : occurrence.options.placement?.index;
        if (
            state.source &&
            !state.placementIndexed &&
            placementIndex === undefined
        ) {
            throw createViewError(
                state.mark,
                "Draw-level placement requires a resolved placement index."
            );
        }
        if (
            state.source &&
            !state.placementIndexed &&
            !isPlacementVisible(
                state.source,
                placementIndex,
                state.viewport,
                draw.scissor,
                canvas
            )
        ) {
            return undefined;
        }

        let firstInstance = range.firstInstance;
        let instanceCount = range.instanceCount;
        if (
            state.xQueryEnabled &&
            queryPackedMarkXIndex(
                range,
                state.xQueryDomain,
                state.xIndexedRange
            )
        ) {
            firstInstance = state.xIndexedRange[0];
            instanceCount = state.xIndexedRange[1] - firstInstance;
            countPerformance("webgpuXIndexQueries");
            countPerformance("webgpuXIndexNativeItems", range.instanceCount);
            countPerformance("webgpuXIndexCandidateItems", instanceCount);
            if (!instanceCount) {
                countPerformance("webgpuXIndexEmptyRanges");
                return undefined;
            }
        } else if (state.xQueryEnabled) {
            countPerformance("webgpuXIndexFallbackQueries");
        }

        let resourceWrites;
        if (!state.updated) {
            state.updated = true;
            if (state.resourcesDirty) {
                resourceWrites = measurePerformance(
                    "retainedResourceSynchronization",
                    () =>
                        this.surface.updateMark(
                            state.mark,
                            state.definition,
                            state.config,
                            state.properties ?? {}
                        )
                );
                state.resourcesDirty = false;
            }
        }

        draw.firstInstance = firstInstance;
        draw.instanceCount = instanceCount;
        if (draw.placement) {
            draw.placement.index = placementIndex;
        }
        this.surface.drawMark(state.mark, draw, state.source, picking);
        countPerformance("drawCommands");
        if (state.placementIndexed) {
            state.submittedPlacementIndexed = true;
        }
        return resourceWrites;
    }

    get currentCoords() {
        const entry = peek(this.#viewStack);
        if (!entry) {
            throw new Error("No current view in WebGPU rendering context.");
        }
        return entry.coords;
    }
}

/** @returns {import("@genome-spy/webgpu-renderer").DrawRect} */
function createDrawRect() {
    return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * @param {Occurrence} occurrence
 * @param {MarkState} state
 * @returns {import("@genome-spy/webgpu-renderer").DrawCommand}
 */
function createOccurrenceDraw(occurrence, state) {
    // Surface replaces these placeholder handles immediately before submission.
    // Keeping the complete renderer shape stable avoids rebuilding its nested
    // mark and placement envelopes on every paint.
    /** @type {import("@genome-spy/webgpu-renderer").DrawCommand} */
    const draw = {
        mark: {
            markId: /** @type {import("@genome-spy/webgpu-renderer").MarkId} */ (
                -1
            ),
        },
        firstInstance: 0,
        instanceCount: 0,
    };
    if (state.viewport) {
        draw.viewport = state.viewport;
    }
    if (occurrence.clip) {
        draw.scissor = createDrawRect();
    }
    if (occurrence.cull) {
        const cullX = occurrence.cull === true || occurrence.cull === "x";
        const cullY = occurrence.cull === true || occurrence.cull === "y";
        draw.visibleRange = {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 0,
            cullX,
            cullY,
        };
    }
    if (state.source) {
        draw.placement = {
            set: { placementSetId: -1 },
            ...(occurrence.options.placement?.clipToPlacement
                ? {
                      clipToPlacement:
                          occurrence.options.placement.clipToPlacement,
                  }
                : {}),
        };
    }
    return draw;
}

/**
 * Materializes closure-backed geometry into stable renderer-facing records.
 * This allocation-free fallback remains necessary until every producer has a
 * complete geometry revision.
 *
 * @param {Occurrence} occurrence
 * @param {MarkState} state
 * @param {import("@genome-spy/webgpu-renderer").DrawCommand} draw
 * @param {{width: number, height: number}} canvas
 */
function refreshOccurrenceDraw(occurrence, state, draw, canvas) {
    if (draw.scissor) {
        const clip = occurrence.clip;
        draw.scissor.x = clip.clipX ? clip.rect.x : 0;
        draw.scissor.y = clip.clipY ? clip.rect.y : 0;
        draw.scissor.width = clip.clipX ? clip.rect.width : canvas.width;
        draw.scissor.height = clip.clipY ? clip.rect.height : canvas.height;
    }
    if (draw.visibleRange) {
        const coords = occurrence.coords;
        const clip = occurrence.cullClip;
        const x = coords.x;
        const y = coords.y;
        draw.visibleRange.x1 = 0;
        draw.visibleRange.x2 = x + coords.width;
        draw.visibleRange.y1 = 0;
        draw.visibleRange.y2 = y + coords.height;
        if (draw.visibleRange.cullX) {
            if (clip?.clipX) {
                const clipX = clip.rect.x;
                draw.visibleRange.x1 = clipX;
                draw.visibleRange.x2 = clipX + clip.rect.width;
            } else {
                draw.visibleRange.x1 = x;
            }
        }
        if (draw.visibleRange.cullY) {
            if (clip?.clipY) {
                const clipY = clip.rect.y;
                draw.visibleRange.y1 = clipY;
                draw.visibleRange.y2 = clipY + clip.rect.height;
            } else {
                draw.visibleRange.y1 = y;
            }
        }
        if (state.viewport) {
            draw.visibleRange.x1 -= state.viewport.x;
            draw.visibleRange.x2 -= state.viewport.x;
            draw.visibleRange.y1 -= state.viewport.y;
            draw.visibleRange.y2 -= state.viewport.y;
        }
    }
}

/**
 * @param {import("@genome-spy/webgpu-renderer").DrawRect} target
 * @param {Rectangle} source
 */
function writeDrawRect(target, source) {
    target.x = source.x;
    target.y = source.y;
    target.width = source.width;
    target.height = source.height;
}

/**
 * @param {MarkState} state
 * @param {{width: number, height: number}} canvas
 * @param {Float32Array} rectangles
 */
function writeOccurrencePlacements(state, canvas, rectangles) {
    for (const occurrence of state.occurrences) {
        const target = occurrence.markCoords;
        const offset = occurrence.placementIndex * 4;
        rectangles[offset] = target.x / canvas.width;
        rectangles[offset + 1] = target.y / canvas.height;
        rectangles[offset + 2] = Math.max(target.width, 1) / canvas.width;
        rectangles[offset + 3] = Math.max(target.height, 1) / canvas.height;
    }
}

/**
 * Resolves draw-index visibility using only dense placement geometry.
 *
 * @param {import("../../view/layout/placementSource.js").default} source
 * @param {number} index
 * @param {import("@genome-spy/webgpu-renderer").DrawRect} owner
 * @param {import("@genome-spy/webgpu-renderer").DrawRect | undefined} scissor
 * @param {{width: number, height: number}} canvas
 */
function isPlacementVisible(source, index, owner, scissor, canvas) {
    const rectangles = source.getSnapshot().rectangles;
    const offset = index * 4;
    if (offset + 3 >= rectangles.length) {
        return false;
    }

    const x = owner.x + rectangles[offset] * owner.width;
    const y = owner.y + rectangles[offset + 1] * owner.height;
    const width = rectangles[offset + 2] * owner.width;
    const height = rectangles[offset + 3] * owner.height;
    if (width <= 0 || height <= 0) {
        return false;
    }

    const x1 = Math.max(0, scissor?.x ?? 0);
    const y1 = Math.max(0, scissor?.y ?? 0);
    const x2 = Math.min(
        canvas.width,
        scissor ? scissor.x + scissor.width : canvas.width
    );
    const y2 = Math.min(
        canvas.height,
        scissor ? scissor.y + scissor.height : canvas.height
    );
    return x < x2 && y < y2 && x + width > x1 && y + height > y1;
}

/**
 * @typedef {object} MarkState
 * @property {import("../../marks/mark.js").default} mark
 * @property {Occurrence[]} occurrences
 * @property {import("./webGpuMarkData.js").PackedMarkData | undefined} packed
 * @property {import("../../view/layout/placementSource.js").default | undefined} source
 * @property {boolean} generatedSource
 * @property {boolean} placementIndexed
 * @property {boolean} submittedPlacementIndexed
 * @property {[number, number]} xQueryDomain
 * @property {[number, number]} xIndexedRange
 * @property {boolean} xQueryEnabled
 * @property {boolean} updated
 * @property {boolean} active
 * @property {Rectangle | undefined} ownerCoords
 * @property {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any> | undefined} definition
 * @property {object | undefined} config
 * @property {Record<string, {value: any}> | undefined} properties
 * @property {number} configRevision
 * @property {number} resourceRevision
 * @property {number} viewOpacity
 * @property {boolean} resourcesDirty
 * @property {number} configX
 * @property {number} configY
 * @property {number} configWidth
 * @property {number} configHeight
 * @property {import("@genome-spy/webgpu-renderer").DrawRect | undefined} viewport
 * @property {Float32Array | undefined} generatedRectangles
 */

/**
 * @typedef {object} Occurrence
 * @property {MarkState} state
 * @property {import("../../types/rendering.js").RenderingOptions} options
 * @property {Rectangle} coords
 * @property {Rectangle} markCoords
 * @property {import("../../types/rendering.js").ClipOptions | undefined} clip
 * @property {import("../../types/rendering.js").ClipOptions | undefined} cullClip
 * @property {import("../../spec/mark.js").MarkProps["cullByVisibleRange"]} cull
 * @property {import("./webGpuMarkData.js").PackedMarkRange} range
 * @property {number} placementIndex
 * @property {import("@genome-spy/webgpu-renderer").DrawCommand | undefined} draw
 */

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} message
 */
function createViewError(mark, message) {
    const error = new Error(
        `${message} Mark: ${mark.getType()}. View: ${mark.unitView.getPathString()}`
    );
    /** @type {any} */ (error).view = mark.unitView;
    return error;
}
