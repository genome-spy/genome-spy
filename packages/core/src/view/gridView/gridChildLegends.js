import { findChannelDefWithScale, isValueDef } from "../../encoder/encoder.js";
import {
    activateExprRefProps,
    resolveInitOnlyExprRef,
} from "../../paramRuntime/paramUtils.js";
import LegendView, {
    LegendRegionView,
    getExternalLegendOverhang,
} from "../legendView.js";

/**
 * @typedef {{
 *     legendView: LegendView,
 *     resolution: import("../../scales/legendResolution.js").default,
 * }} GridChildLegendEntry
 *
 * @typedef {{
 *     definition: import("../../scales/legendResolution.js").LegendDefinition,
 *     resolution: import("../../scales/legendResolution.js").default,
 * }} OrderedLegendEntry
 *
 * @typedef {{
 *     legendView: LegendRegionView,
 *     entries: GridChildLegendEntry[],
 * }} GridChildLegendRegion
 *
 * @typedef {Partial<Record<import("../../spec/legend.js").LegendOrient, GridChildLegendRegion>>} GridChildLegends
 * @typedef {Omit<import("../../spec/legend.js").LegendConfig, "orient"> & {
 *     orient?: import("../../spec/legend.js").LegendOrient
 * }} ResolvedLegendConfig
 */

const INHERITED_SYMBOL_ENCODING_CHANNELS = /** @type {const} */ ([
    "color",
    "fill",
    "stroke",
    "opacity",
    "fillOpacity",
    "strokeOpacity",
    "strokeWidth",
    "shape",
]);

const LEGEND_ORIENTS = new Set(
    /** @type {const} */ ([
        "left",
        "right",
        "top",
        "bottom",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
    ])
);

/**
 * @param {import("../view.js").default[]} legendOwners
 * @returns {Map<import("../view.js").default, number>}
 */
function getDepthFirstViewOrder(legendOwners) {
    /** @type {Map<import("../view.js").default, number>} */
    const order = new Map();

    for (const owner of legendOwners) {
        owner.visit((view) => {
            if (!order.has(view)) {
                order.set(view, order.size);
            }
        });
    }

    return order;
}

/**
 * @param {import("../../scales/legendResolution.js").LegendDefinition} definition
 * @returns {string}
 */
function getLegendSortLabel(definition) {
    return String(
        definition.legend.title ?? definition.field ?? definition.channel
    ).toLocaleLowerCase();
}

/**
 * @param {import("../view.js").default[]} legendOwners
 * @returns {OrderedLegendEntry[]}
 */
export function getOrderedLegendEntries(legendOwners) {
    const viewOrder = getDepthFirstViewOrder(legendOwners);
    /** @type {OrderedLegendEntry[]} */
    const entries = [];

    for (const legendOwner of legendOwners) {
        for (const resolution of Object.values(
            legendOwner.resolutions.legend
        )) {
            for (const definition of resolution.getLegendDefs()) {
                entries.push({ definition, resolution });
            }
        }
    }

    entries.sort((a, b) => {
        const viewDiff =
            (viewOrder.get(a.definition.view) ?? Number.MAX_SAFE_INTEGER) -
            (viewOrder.get(b.definition.view) ?? Number.MAX_SAFE_INTEGER);
        if (viewDiff != 0) {
            return viewDiff;
        }

        const labelDiff = getLegendSortLabel(a.definition).localeCompare(
            getLegendSortLabel(b.definition)
        );
        if (labelDiff != 0) {
            return labelDiff;
        }

        return a.definition.channel.localeCompare(b.definition.channel);
    });

    return entries;
}

/**
 * @param {import("../../spec/channel.js").ChannelDef | undefined} channelDef
 * @returns {import("../../spec/channel.js").ValueDef | undefined}
 */
function getEmptySelectionValueDef(channelDef) {
    if (channelDef && "condition" in channelDef) {
        const conditions = Array.isArray(channelDef.condition)
            ? channelDef.condition
            : [channelDef.condition];
        for (const condition of conditions) {
            if (condition.empty !== false && "value" in condition) {
                return { value: condition.value };
            }
        }
    }

    return isValueDef(channelDef) ? { value: channelDef.value } : undefined;
}

/**
 * @param {any} value
 * @returns {value is string}
 */
function isConstantColor(value) {
    return typeof value === "string";
}

/**
 * @param {Record<string, import("../../spec/channel.js").ValueDef<any>>} encoding
 * @param {Set<string>} scaledChannels
 * @param {Partial<import("../../spec/mark.js").PointProps>} sourceProps
 */
function applyConstantMarkColorStyle(encoding, scaledChannels, sourceProps) {
    if (isConstantColor(sourceProps.fill) && !scaledChannels.has("fill")) {
        encoding.fill = { value: sourceProps.fill };
    }
    if (isConstantColor(sourceProps.stroke) && !scaledChannels.has("stroke")) {
        encoding.stroke = { value: sourceProps.stroke };
    }

    if (isConstantColor(sourceProps.color) && !scaledChannels.has("color")) {
        if (sourceProps.filled) {
            if (!scaledChannels.has("fill")) {
                encoding.fill = { value: sourceProps.color };
            }
            if (!scaledChannels.has("stroke")) {
                encoding.stroke = { value: null };
            }
            if (!scaledChannels.has("strokeWidth")) {
                encoding.strokeWidth = { value: 0 };
            }
        } else {
            if (!scaledChannels.has("stroke")) {
                encoding.stroke = { value: sourceProps.color };
            }
            if (!scaledChannels.has("fill")) {
                encoding.fill = { value: sourceProps.color };
            }
            if (!scaledChannels.has("fillOpacity")) {
                encoding.fillOpacity = { value: 0 };
            }
        }
    }
}

/**
 * @param {import("../unitView.js").default} sourceView
 * @param {import("../../spec/channel.js").ChannelWithScale} channel
 * @returns {boolean}
 */
function hasScaleBackedChannel(sourceView, channel) {
    return Boolean(
        findChannelDefWithScale(sourceView.spec.encoding?.[channel])
    );
}

/**
 * Vega-Lite's `compile/legend/encode.ts` neutralizes non-redundant color
 * encodings in other symbol legends. See its
 * "should have fill if a color encoding exists" test: a size legend with an
 * independent color scale gets a neutral black symbol instead of reusing the
 * color scale. GenomeSpy follows that behavior to avoid suggesting that the
 * size legend also explains color.
 *
 * @param {Record<string, import("../../spec/channel.js").ValueDef<any>>} encoding
 * @param {Set<string>} scaledChannels
 * @param {import("../unitView.js").default} sourceView
 */
function applyConflictingScaledColorStyle(
    encoding,
    scaledChannels,
    sourceView
) {
    const hasConflictingColorScale = /** @type {const} */ ([
        "color",
        "fill",
        "stroke",
    ]).some(
        (channel) =>
            !scaledChannels.has(channel) &&
            hasScaleBackedChannel(sourceView, channel)
    );

    if (hasConflictingColorScale && !scaledChannels.has("fill")) {
        encoding.fill = { value: "black" };
    }
}

/**
 * @param {import("../../spec/channel.js").ChannelWithScale} channel
 * @param {Partial<Record<import("../../spec/channel.js").ChannelWithScale, string>>} symbolChannels
 * @param {import("../unitView.js").default} sourceView
 */
function createInheritedSymbolStyle(channel, symbolChannels, sourceView) {
    const scaledChannels = new Set([channel, ...Object.keys(symbolChannels)]);

    /** @type {import("../legendView.js").SymbolLegendStyle} */
    const style = { mark: {}, encoding: {} };
    const sourceProps =
        /** @type {Partial<import("../../spec/mark.js").PointProps>} */ (
            sourceView.mark.properties
        );
    const styleEncoding =
        /** @type {Record<string, import("../../spec/channel.js").ValueDef<any>>} */ (
            style.encoding
        );
    const styleMark =
        /** @type {Partial<import("../../spec/mark.js").PointProps>} */ (
            style.mark
        );

    if (sourceProps.filled !== undefined) {
        styleMark.filled = sourceProps.filled;
    }
    if (sourceProps.opacity !== undefined) {
        styleMark.opacity = sourceProps.opacity;
    }
    if (sourceProps.fillOpacity !== undefined) {
        styleMark.fillOpacity = sourceProps.fillOpacity;
    }
    if (sourceProps.strokeOpacity !== undefined) {
        styleMark.strokeOpacity = sourceProps.strokeOpacity;
    }
    if (sourceProps.strokeWidth !== undefined) {
        styleMark.strokeWidth = sourceProps.strokeWidth;
    }
    if (sourceProps.shape !== undefined) {
        styleMark.shape = sourceProps.shape;
    } else if (sourceView.getMarkType() == "rect") {
        styleMark.shape = "square";
    }

    applyConstantMarkColorStyle(styleEncoding, scaledChannels, sourceProps);
    applyConflictingScaledColorStyle(styleEncoding, scaledChannels, sourceView);

    const colorDef = sourceView.spec.encoding?.color;
    const filled = sourceProps.filled;
    const colorValueDef = getEmptySelectionValueDef(colorDef);
    if (colorValueDef && !scaledChannels.has("color")) {
        if (filled) {
            styleEncoding.fill = colorValueDef;
            styleEncoding.stroke = { value: null };
            styleEncoding.strokeWidth = { value: 0 };
        } else {
            styleEncoding.stroke = colorValueDef;
            styleEncoding.fill = colorValueDef;
            styleEncoding.fillOpacity = { value: 0 };
        }
    }

    for (const channel of INHERITED_SYMBOL_ENCODING_CHANNELS) {
        if (channel == "color" || scaledChannels.has(channel)) {
            continue;
        }

        const channelDef = sourceView.spec.encoding?.[channel];
        const valueDef = getEmptySelectionValueDef(channelDef);
        if (valueDef) {
            styleEncoding[channel] = valueDef;
        }
    }

    return style;
}

/**
 * @param {any} orient
 * @returns {asserts orient is import("../../spec/legend.js").LegendOrient}
 */
function assertLegendOrient(orient) {
    if (!LEGEND_ORIENTS.has(orient)) {
        throw new Error(`Invalid legend orientation "${orient}"!`);
    }
}

/**
 * @param {import("../../spec/legend.js").LegendConfig} legend
 * @param {import("../view.js").default} legendParent
 * @param {(disposer: () => void) => void} registerDisposer
 * @returns {ResolvedLegendConfig}
 */
function resolveLegendOrient(legend, legendParent, registerDisposer) {
    const orient = resolveInitOnlyExprRef(
        legendParent.paramRuntime,
        legend.orient,
        "Reactive legend orient changes are not supported.",
        registerDisposer
    );
    if (orient !== undefined) {
        assertLegendOrient(orient);
    }

    return orient === legend.orient
        ? /** @type {ResolvedLegendConfig} */ (legend)
        : /** @type {ResolvedLegendConfig} */ ({ ...legend, orient });
}

/**
 * @param {import("../../spec/legend.js").LegendConfig} legend
 * @param {import("../view.js").default} legendParent
 * @param {(disposer: () => void) => void} registerDisposer
 * @param {() => void} listener
 * @returns {ResolvedLegendConfig}
 */
function resolveLegendProps(legend, legendParent, registerDisposer, listener) {
    const orientedLegend = resolveLegendOrient(
        legend,
        legendParent,
        registerDisposer
    );

    return activateExprRefProps(
        legendParent.paramRuntime,
        orientedLegend,
        (props) => {
            if (props.has("disable")) {
                listener();
            }
        },
        registerDisposer
    );
}

/**
 * @param {import("../../scales/legendResolution.js").LegendDefinition} definition
 * @param {import("../containerView.js").default} layoutParent
 * @returns {Promise<LegendView>}
 */
export async function createGridChildLegend(definition, layoutParent) {
    const legendParent = definition.view;
    /** @type {(() => void)[]} */
    const legendDisposers = [];
    /** @type {LegendView | undefined} */
    let legend;
    const legendProps = resolveLegendProps(
        definition.legend,
        legendParent,
        (disposer) => legendDisposers.push(disposer),
        () => {
            if (!legend) {
                throw new Error("Legend has not been initialized!");
            }

            legend.invalidateSizeCache();

            legend.context.requestLayoutReflow();
        }
    );
    const symbolStyle =
        definition.type == "symbol"
            ? createInheritedSymbolStyle(
                  definition.channel,
                  definition.symbolChannels ?? {},
                  // Multi-view arbitration is intentionally simple for now:
                  // use the first deterministic contributor.
                  definition.scaleResolution.getOrderedMembers()[0].view
              )
            : undefined;

    legend = new LegendView(
        {
            channel: definition.channel,
            type: definition.type,
            symbolChannels: definition.symbolChannels,
            symbolGeometry: definition.symbolGeometry,
            symbolStyle,
            legend: legendProps,
            format: definition.format,
            dataType: definition.dataType,
        },
        layoutParent.context,
        layoutParent,
        legendParent
    );

    for (const dispose of legendDisposers) {
        legend.registerDisposer(dispose);
    }

    await legend.initializeChildren();
    return legend;
}

/**
 * @param {GridChildLegends} legends
 * @param {LegendView} legend
 * @param {import("../../scales/legendResolution.js").default} resolution
 */
export async function addLegendView(legends, legend, resolution) {
    const orient = /** @type {import("../../spec/legend.js").LegendOrient} */ (
        legend.legendProps.orient ?? "right"
    );
    let region = legends[orient];

    if (!region) {
        const regionView = new LegendRegionView(
            orient,
            legend.legendProps.spacing ?? 0,
            legend.context,
            legend.layoutParent,
            legend.dataParent
        );
        await regionView.initializeChildren();
        region = { legendView: regionView, entries: [] };
        legends[orient] = region;
    }

    legend.setActivePredicate(
        () =>
            !legend.legendProps.disable &&
            resolution.hasVisibleNonChromeMember()
    );
    region.legendView.addLegendView(legend);
    region.entries.push({ legendView: legend, resolution });
}

/**
 * @param {GridChildLegends} legends
 */
export function* iterateLegendViews(legends) {
    for (const region of Object.values(legends)) {
        yield region.legendView;
    }
}

/**
 * @param {GridChildLegends} legends
 */
export function disposeLegendViews(legends) {
    for (const legendView of iterateLegendViews(legends)) {
        legendView.disposeSubtree();
    }
}

/**
 * @param {GridChildLegends} legends
 * @param {import("../../spec/legend.js").LegendOrient} orient
 */
export function getLegendOverhang(legends, orient) {
    const region = legends[orient];
    return region && isActiveLegendRegion(region)
        ? getExternalLegendOverhang(region.legendView)
        : 0;
}

/**
 * @param {GridChildLegendEntry} entry
 */
export function isActiveLegendEntry(entry) {
    return entry.resolution.hasVisibleNonChromeMember();
}

/**
 * @param {GridChildLegendRegion} region
 */
export function isActiveLegendRegion(region) {
    return region.entries.some(isActiveLegendEntry);
}
