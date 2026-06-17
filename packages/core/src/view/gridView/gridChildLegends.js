import { isValueDef } from "../../encoder/encoder.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";
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
 * @param {import("../../spec/channel.js").ChannelDef | undefined} channelDef
 * @returns {channelDef is import("../../spec/channel.js").ValueDef}
 */
function isConstantValueDef(channelDef) {
    return isValueDef(channelDef) && !("condition" in channelDef);
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

    const colorDef = sourceView.spec.encoding?.color;
    const filled = sourceProps.filled;
    if (isConstantValueDef(colorDef) && !scaledChannels.has("color")) {
        if (filled) {
            styleEncoding.fill = { value: colorDef.value };
            styleEncoding.stroke = { value: null };
            styleEncoding.strokeWidth = { value: 0 };
        } else {
            styleEncoding.stroke = { value: colorDef.value };
            styleEncoding.fill = { value: colorDef.value };
            styleEncoding.fillOpacity = { value: 0 };
        }
    }

    for (const channel of INHERITED_SYMBOL_ENCODING_CHANNELS) {
        if (channel == "color" || scaledChannels.has(channel)) {
            continue;
        }

        const channelDef = sourceView.spec.encoding?.[channel];
        if (isConstantValueDef(channelDef)) {
            styleEncoding[channel] = { value: channelDef.value };
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
 * @param {import("../unitView.js").default} legendParent
 * @param {(disposer: () => void) => void} registerDisposer
 * @returns {ResolvedLegendConfig}
 */
function resolveLegendOrient(legend, legendParent, registerDisposer) {
    if (!isExprRef(legend.orient)) {
        if (legend.orient !== undefined) {
            assertLegendOrient(legend.orient);
        }
        return /** @type {ResolvedLegendConfig} */ (legend);
    }

    const orientRef = legend.orient;
    const orient = legendParent.paramRuntime.evaluateAndGet(orientRef.expr);
    assertLegendOrient(orient);
    legendParent.paramRuntime.watchExpression(
        orientRef.expr,
        () => {
            throw new Error(
                "Reactive legend orient changes are not supported."
            );
        },
        {
            scopeOwned: false,
            registerDisposer,
        }
    );

    return /** @type {ResolvedLegendConfig} */ ({
        ...legend,
        orient,
    });
}

/**
 * @param {import("../../scales/legendResolution.js").LegendDefinition} definition
 * @param {import("../unitView.js").default} legendParent
 * @param {import("../containerView.js").default} layoutParent
 * @returns {Promise<LegendView>}
 */
export async function createGridChildLegend(
    definition,
    legendParent,
    layoutParent
) {
    /** @type {(() => void)[]} */
    const orientDisposers = [];
    const legendProps = resolveLegendOrient(
        definition.legend,
        legendParent,
        (disposer) => orientDisposers.push(disposer)
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

    const legend = new LegendView(
        {
            channel: definition.channel,
            type: definition.type,
            symbolChannels: definition.symbolChannels,
            symbolStyle,
            legend: legendProps,
            format: definition.format,
            dataType: definition.dataType,
        },
        layoutParent.context,
        layoutParent,
        legendParent
    );

    for (const dispose of orientDisposers) {
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
