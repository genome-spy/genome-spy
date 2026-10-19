import { findChannelDefWithScale, isValueDef } from "../../encoder/encoder.js";
import {
    expandNamedPredicateCondition,
    normalizeSelectionPredicateTree,
    selectionPredicateMatchesWhenEmpty,
} from "../../selection/selectionPredicateTree.js";
import { asArray } from "../../utils/arrayUtils.js";
import { getConfiguredLegendRegionLayout } from "../../config/legendConfig.js";
import { getConfiguredMarkDefaults } from "../../config/markConfig.js";
import {
    activateExprRefProps,
    isExprRef,
    resolveInitOnlyExprRef,
} from "../../paramRuntime/paramUtils.js";
import LegendView, { LegendRegionView } from "../legendView.js";

/**
 * @typedef {{
 *     definition: import("../../scales/legendResolution.js").LegendDefinition,
 *     resolution: import("../../scales/legendResolution.js").default,
 *     owner: import("../view.js").default,
 * }} OrderedLegendEntry
 *
 * @typedef {Partial<Record<import("../../spec/legend.js").LegendOrient, LegendRegionView>>} GridChildLegends
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

// These values belong to generated mark encoders, which retain live bindings.
const LEGEND_PAINT_PROPS = new Set([
    "backgroundFill",
    "backgroundStroke",
    "gradientStrokeColor",
    "labelColor",
    "titleColor",
    "symbolFillColor",
    "symbolStrokeColor",
    "symbolBaseFillColor",
    "symbolBaseStrokeColor",
    "symbolOpacity",
]);

export const INSIDE_LEGEND_ORIENTS = new Set(
    /** @type {import("../../spec/legend.js").LegendOrient[]} */ ([
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
    ])
);

const LEGEND_ORIENTS = new Set([
    "left",
    "right",
    "top",
    "bottom",
    ...INSIDE_LEGEND_ORIENTS,
]);

/**
 * @param {LegendView} legend
 */
export function isInsideLegend(legend) {
    const orient = /** @type {import("../../spec/legend.js").LegendOrient} */ (
        legend.legendProps.orient ?? "right"
    );
    return INSIDE_LEGEND_ORIENTS.has(orient);
}

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
                entries.push({ definition, resolution, owner: legendOwner });
            }
        }
    }

    entries.sort((a, b) => {
        return (
            (viewOrder.get(a.definition.view) ?? Number.MAX_SAFE_INTEGER) -
                (viewOrder.get(b.definition.view) ?? Number.MAX_SAFE_INTEGER) ||
            getLegendSortLabel(a.definition).localeCompare(
                getLegendSortLabel(b.definition)
            ) ||
            a.definition.channel.localeCompare(b.definition.channel)
        );
    });

    return entries;
}

/**
 * @param {import("../../spec/channel.js").ChannelDef | undefined} channelDef
 * @param {Record<string, import("../../spec/channel.js").SelectionPredicateDefinition>} predicates
 * @returns {import("../../spec/channel.js").ValueDef | undefined}
 */
function getEmptySelectionValueDef(channelDef, predicates) {
    if (channelDef && "condition" in channelDef) {
        const conditions = asArray(channelDef.condition);
        for (const condition of conditions) {
            const empty = selectionPredicateMatchesWhenEmpty(
                normalizeSelectionPredicateTree(
                    expandNamedPredicateCondition(condition, predicates)
                )
            );
            if (empty && "value" in condition) {
                return { value: condition.value };
            }
        }
    }

    return isValueDef(channelDef) ? { value: channelDef.value } : undefined;
}

/**
 * @param {any} value
 * @returns {value is string | import("../../spec/parameter.js").ExprRef}
 */
function isColorValue(value) {
    return typeof value === "string" || isExprRef(value);
}

/**
 * @param {Record<string, import("../../spec/channel.js").ValueDef<any>>} encoding
 * @param {Set<string>} scaledChannels
 * @param {Partial<import("../../spec/mark.js").PointProps>} sourceProps
 * @param {import("../../spec/legend.js").LegendConfig} legend
 */
function applyMarkColorStyle(encoding, scaledChannels, sourceProps, legend) {
    if (isColorValue(sourceProps.fill) && !scaledChannels.has("fill")) {
        encoding.fill = { value: sourceProps.fill };
    }
    if (isColorValue(sourceProps.stroke) && !scaledChannels.has("stroke")) {
        encoding.stroke = { value: sourceProps.stroke };
    }

    if (isColorValue(sourceProps.color) && !scaledChannels.has("color")) {
        if (sourceProps.filled) {
            if (!scaledChannels.has("fill") && !encoding.fill) {
                encoding.fill = { value: sourceProps.color };
            }
            if (!scaledChannels.has("stroke") && !encoding.stroke) {
                encoding.stroke = { value: null };
            }
            if (
                !scaledChannels.has("strokeWidth") &&
                !isColorValue(sourceProps.stroke) &&
                legend.symbolStrokeColor === undefined
            ) {
                encoding.strokeWidth = { value: 0 };
            }
        } else {
            if (!scaledChannels.has("stroke") && !encoding.stroke) {
                encoding.stroke = { value: sourceProps.color };
            }
            if (!scaledChannels.has("fill") && !encoding.fill) {
                encoding.fill = { value: sourceProps.color };
            }
            if (
                !scaledChannels.has("fillOpacity") &&
                legend.symbolFillColor === undefined
            ) {
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
        encoding.fill = {
            value:
                getConfiguredMarkDefaults(
                    sourceView.getConfigScopes(),
                    "rule",
                    undefined
                ).color ?? "black",
        };
    }
}

/**
 * @param {import("../../spec/channel.js").ChannelWithScale} channel
 * @param {Partial<Record<import("../../spec/channel.js").ChannelWithScale, string>>} symbolChannels
 * @param {import("../unitView.js").default} sourceView
 * @param {import("../../spec/legend.js").LegendConfig} legend
 */
function createInheritedSymbolStyle(
    channel,
    symbolChannels,
    sourceView,
    legend
) {
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

    for (const key of /** @type {const} */ ([
        "filled",
        "opacity",
        "fillOpacity",
        "strokeOpacity",
        "strokeWidth",
        "shape",
    ])) {
        if (sourceProps[key] !== undefined) {
            Object.assign(styleMark, { [key]: sourceProps[key] });
        }
    }
    if (styleMark.shape === undefined && sourceView.getMarkType() == "rect") {
        styleMark.shape = "square";
    }

    applyMarkColorStyle(styleEncoding, scaledChannels, sourceProps, legend);
    applyConflictingScaledColorStyle(styleEncoding, scaledChannels, sourceView);

    const colorDef = sourceView.spec.encoding?.color;
    const filled = sourceProps.filled;
    const colorValueDef = getEmptySelectionValueDef(
        colorDef,
        sourceView.spec.predicates ?? {}
    );
    if (colorValueDef && !scaledChannels.has("color")) {
        if (filled) {
            styleEncoding.fill = colorValueDef;
            styleEncoding.stroke = { value: null };
            if (legend.symbolStrokeColor === undefined) {
                styleEncoding.strokeWidth = { value: 0 };
            }
        } else {
            styleEncoding.stroke = colorValueDef;
            styleEncoding.fill = colorValueDef;
            if (legend.symbolFillColor === undefined) {
                styleEncoding.fillOpacity = { value: 0 };
            }
        }
    }

    for (const channel of INHERITED_SYMBOL_ENCODING_CHANNELS) {
        if (channel == "color" || scaledChannels.has(channel)) {
            continue;
        }

        const channelDef = sourceView.spec.encoding?.[channel];
        const valueDef = getEmptySelectionValueDef(
            channelDef,
            sourceView.spec.predicates ?? {}
        );
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

    const paintProps = {};
    /** @type {ResolvedLegendConfig} */
    const otherProps = {};
    for (const [key, value] of Object.entries(orientedLegend)) {
        Object.assign(LEGEND_PAINT_PROPS.has(key) ? paintProps : otherProps, {
            [key]: value,
        });
    }

    return Object.assign(
        activateExprRefProps(
            legendParent.paramRuntime,
            otherProps,
            (props) => {
                if (props.has("disable")) {
                    listener();
                }
            },
            registerDisposer
        ),
        paintProps
    );
}

/**
 * @param {import("../../scales/legendResolution.js").LegendDefinition} definition
 * @param {import("../containerView.js").default} layoutParent
 * @returns {Promise<LegendView>}
 */
export async function createGridChildLegend(definition, layoutParent) {
    const legendParent = definition.view;
    /** @type {{ name: string, expr: string, runtime: import("../../paramRuntime/viewParamRuntime.js").default }[]} */
    const expressions = [];
    /**
     * Generated legend internals declare their own layout parameters. Keep
     * styling expressions bound to the view that contributed each style.
     * @template T
     * @param {T} value
     * @param {import("../../paramRuntime/viewParamRuntime.js").default} runtime
     * @returns {T}
     */
    const scopeExpression = (value, runtime) => {
        if (!isExprRef(value)) {
            return value;
        }

        const name = "__legend_style_" + expressions.length;
        expressions.push({ name, expr: value.expr, runtime });
        return /** @type {T} */ ({ expr: name });
    };
    /** @type {(() => void)[]} */
    const legendDisposers = [];
    /** @type {LegendView | undefined} */
    let legend;
    const legendProps = resolveLegendProps(
        Object.fromEntries(
            Object.entries(definition.legend).map(([key, value]) => [
                key,
                LEGEND_PAINT_PROPS.has(key)
                    ? scopeExpression(value, legendParent.paramRuntime)
                    : value,
            ])
        ),
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
    // The legend definition and first scale contributor can be different views
    // when legends are collected. Inherited mark styling keeps the latter scope.
    const sourceView = definition.scaleResolution.getOrderedMembers()[0].view;
    const symbolStyle =
        definition.type == "symbol"
            ? createInheritedSymbolStyle(
                  definition.channel,
                  definition.symbolChannels ?? {},
                  // Multi-view arbitration is intentionally simple for now:
                  // use the first deterministic contributor.
                  sourceView,
                  legendProps
              )
            : undefined;
    if (symbolStyle) {
        for (const [key, value] of Object.entries(symbolStyle.mark)) {
            Object.assign(symbolStyle.mark, {
                [key]: scopeExpression(value, sourceView.paramRuntime),
            });
        }
        const styleEncoding =
            /** @type {Record<string, import("../../spec/channel.js").ValueDef>} */ (
                symbolStyle.encoding
            );
        for (const [channel, valueDef] of Object.entries(styleEncoding)) {
            // Generic color can supply both fill and stroke through one ValueDef.
            styleEncoding[channel] = {
                ...valueDef,
                value: scopeExpression(valueDef.value, sourceView.paramRuntime),
            };
        }
    }

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
    for (const { name, expr, runtime } of expressions) {
        legend.paramRuntime.registerScopedExpression(name, expr, runtime);
    }

    await legend.initializeChildren();
    return legend;
}

/**
 * Creates the selected guides at a layout host and groups them into regions.
 *
 * @param {GridChildLegends} legends
 * @param {import("../view.js").default[]} owners
 * @param {import("../containerView.js").default} layoutParent
 * @param {(owner: import("../view.js").default, resolution: import("../../scales/legendResolution.js").default) => boolean} includeOwner
 * @param {(legend: LegendView, owner: import("../view.js").default) => boolean} [filter]
 */
export async function createLegendViews(
    legends,
    owners,
    layoutParent,
    includeOwner,
    filter
) {
    for (const { definition, resolution, owner } of getOrderedLegendEntries(
        owners
    )) {
        if (!includeOwner(owner, resolution)) {
            continue;
        }

        const legend = await createGridChildLegend(definition, layoutParent);
        if (filter && !filter(legend, owner)) {
            legend.disposeSubtree();
        } else {
            addLegendView(legends, legend, resolution);
        }
    }
}

/**
 * @param {GridChildLegends} legends
 * @param {LegendView} legend
 * @param {import("../../scales/legendResolution.js").default} resolution
 */
export function addLegendView(legends, legend, resolution) {
    const orient = /** @type {import("../../spec/legend.js").LegendOrient} */ (
        legend.legendProps.orient ?? "right"
    );
    let region = legends[orient];

    if (!region) {
        const { anchor, direction, wrap } = getConfiguredLegendRegionLayout(
            legend.layoutParent.getConfigScopes(),
            orient
        );
        region = new LegendRegionView(
            orient,
            anchor,
            direction,
            wrap,
            legend.legendProps.spacing ?? 0,
            legend.context,
            legend.layoutParent,
            legend.dataParent
        );
        legends[orient] = region;
    }

    legend.setActivePredicate(
        () =>
            !legend.legendProps.disable &&
            resolution.hasVisibleNonChromeMember()
    );
    region.addLegendView(legend);
}

/**
 * @param {GridChildLegends} legends
 * @param {number} width
 * @param {number} height
 */
export function prepareLegendLayoutSize(legends, width, height) {
    let changed = false;
    for (const regionView of Object.values(legends)) {
        const regionChanged = regionView.prepareLayoutSize(width, height);
        changed ||= regionChanged;
    }
    return changed;
}

/**
 * @param {GridChildLegends} legends
 */
export function disposeLegendViews(legends) {
    for (const legendView of Object.values(legends)) {
        legendView.disposeSubtree();
    }
}

/**
 * @param {GridChildLegends} legends
 * @param {import("../../spec/legend.js").LegendOrient} orient
 */
export function getLegendOverhang(legends, orient) {
    const region = legends[orient];
    return region?.isActive()
        ? region.getPerpendicularSize() + region.getOffset()
        : 0;
}
