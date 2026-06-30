import { isRulerParameter } from "../../paramRuntime/paramUtils.js";
import {
    asSelectionConfig,
    isIntervalSelectionConfig,
} from "../../selection/selection.js";
import AxisGridView from "../axisGridView.js";
import AxisView, {
    CHANNEL_ORIENTS,
    getExternalAxisOverhang,
} from "../axisView.js";
import LayerView from "../layerView.js";
import Padding from "../layout/padding.js";
import Rectangle from "../layout/rectangle.js";
import TitleView from "../titleView.js";
import UnitView from "../unitView.js";
import {
    isChromeView,
    markViewAsChrome,
    markViewAsNonAddressable,
} from "../viewSelectors.js";
import Scrollbar from "./scrollbar.js";
import { getConfiguredViewBackground } from "../../config/viewConfig.js";
import { getConfiguredAxisDefaults } from "../../config/axisConfig.js";
import {
    addLegendView,
    createGridChildLegend,
    disposeLegendViews,
    getLegendOverhang,
    getOrderedLegendEntries,
    iterateLegendViews,
} from "./gridChildLegends.js";
import { RulerMouseEventController } from "../../ruler/rulerMouseEventController.js";
import { RulerViewportController } from "../../ruler/rulerViewportController.js";
import {
    createConfiguredRulerOverlayView,
    resolveRulerOverlayExtent,
} from "./rulerOverlay.js";
import { IntervalSelectionController } from "./intervalSelectionController.js";

export { resolveIntervalZoomEventConfig } from "./intervalSelectionController.js";

/**
 * @typedef {{
 *     axisView: AxisView,
 *     channel: import("../../spec/channel.js").PrimaryPositionalChannel,
 *     orient: import("../../spec/axis.js").AxisOrient,
 *     resolution: import("../../scales/axisResolution.js").default,
 * }} AxisCandidate
 * @typedef {{
 *     owner: import("../view.js").default,
 *     paramName: string,
 *     config: import("../../spec/parameter.js").RulerConfig,
 * }} GridChildRulerBinding
 */

/**
 * @param {import("../view.js").default} view
 * @returns {import("../view.js").default[]}
 */
function getLegendOwners(view) {
    if (isChromeView(view) || view.getLayoutAncestors().some(isChromeView)) {
        return [];
    } else if (view instanceof UnitView) {
        return Object.keys(view.resolutions.legend).length > 0 ? [view] : [];
    } else if (view instanceof LayerView) {
        return [
            ...(Object.keys(view.resolutions.legend).length > 0 ? [view] : []),
            ...Array.from(view).flatMap((child) => getLegendOwners(child)),
        ];
    } else {
        return [];
    }
}

export default class GridChild {
    /**
     * Users guide:
     * - GridChild is owned by GridView and is not meant to be instantiated or
     *   managed directly by callers.
     * - Use GridView/ConcatView APIs for insertion/removal so decorations and
     *   dataflow are kept in sync.
     */

    /** @type {IntervalSelectionController[]} */
    #intervalSelectionControllers = [];

    /** @type {RulerMouseEventController[]} */
    #rulerMouseEventControllers = [];

    /** @type {RulerViewportController[]} */
    #rulerViewportControllers = [];

    /** @type {number} */
    #serial;

    #generatedOverlaysInitialized = false;

    /**
     * @param {import("../view.js").default} view
     * @param {import("../containerView.js").default} layoutParent
     * @param {number} serial
     */
    constructor(view, layoutParent, serial) {
        this.layoutParent = layoutParent;
        this.view = view;
        this.#serial = serial;

        /** @type {UnitView} */
        this.background = undefined;

        /** @type {UnitView} */
        this.backgroundStroke = undefined;

        /** @type {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisView>>} axes */
        this.axes = {};

        /** @type {AxisCandidate[]} */
        this.axisCandidates = [];

        /** @type {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisGridView>>} gridLines */
        this.gridLines = {};

        /** @type {import("./gridChildLegends.js").GridChildLegends} */
        this.legends = {};

        /** @type {Partial<Record<import("./scrollbar.js").ScrollDirection, Scrollbar>>} */
        this.scrollbars = {};

        /** @type {import("./selectionRect.js").SelectionRectOverlay} */
        this.selectionRect = undefined;

        /** @type {{ view: LayerView, zindex: number }[]} */
        this.rulerOverlays = [];

        /** @type {TitleView} */
        this.title = undefined;

        /** @type {number} */
        this.backgroundZindex = 0;

        /** @type {number | undefined} */
        this.backgroundStrokeZindex = undefined;

        /** @type {Rectangle} */
        this.coords = Rectangle.ZERO;

        const needsAxes = view.needsAxes.x || view.needsAxes.y;
        const parentChromePolicy = view.getParentGridChromePolicy();
        const spec = view.spec;
        const explicitViewBackground = "view" in spec ? spec.view : undefined;

        if (
            parentChromePolicy.background &&
            (needsAxes || explicitViewBackground)
        ) {
            const viewBackground = getConfiguredViewBackground(
                view.getConfigScopes(),
                explicitViewBackground
            );
            this.backgroundZindex = viewBackground?.zindex ?? 0;
            this.backgroundStrokeZindex = viewBackground?.strokeZindex;

            const backgroundSpec = createBackground(viewBackground);
            if (backgroundSpec) {
                this.background = new UnitView(
                    backgroundSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "background" + serial
                );
                markViewAsNonAddressable(this.background, {
                    skipSubtree: true,
                });
                markViewAsChrome(this.background, { skipSubtree: true });
            }

            const backgroundStrokeSpec = createBackgroundStroke(viewBackground);
            if (backgroundStrokeSpec) {
                this.backgroundStroke = new UnitView(
                    backgroundStrokeSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "backgroundStroke" + serial
                );
                markViewAsNonAddressable(this.backgroundStroke, {
                    skipSubtree: true,
                });
                markViewAsChrome(this.backgroundStroke, {
                    skipSubtree: true,
                });
            }
        }

        this.title = view.spec.title
            ? TitleView.create(
                  view.spec.title,
                  view.getConfigScopes(),
                  layoutParent.context,
                  layoutParent,
                  view,
                  "title" + serial
              )
            : undefined;

        // TODO: More specific getter for this
        if (view.spec.viewportWidth != null) {
            this.scrollbars.horizontal = new Scrollbar(this, "horizontal");
        }

        if (view.spec.viewportHeight != null) {
            this.scrollbars.vertical = new Scrollbar(this, "vertical");
        }

        this.#setupIntervalSelection();
        this.#setupRulers();
    }

    #setupRulers() {
        for (const {
            owner,
            paramName,
            config: ruler,
        } of this.#getRulerBindings()) {
            const channels = ruler.encodings ?? ["x"];
            const scaleResolutions = this.#getRulerScaleResolutions(
                paramName,
                channels
            );

            if (ruler.source === "viewport") {
                this.#rulerViewportControllers.push(
                    new RulerViewportController(
                        this,
                        paramName,
                        ruler,
                        channels,
                        scaleResolutions,
                        owner.paramRuntime
                    )
                );
            } else {
                this.#rulerMouseEventControllers.push(
                    new RulerMouseEventController(
                        this,
                        paramName,
                        ruler,
                        channels,
                        scaleResolutions,
                        owner.paramRuntime
                    )
                );
            }

            if (ruler.display === "none") {
                continue;
            } else if (
                this.#usesContainerRulerOverlay(
                    owner,
                    paramName,
                    ruler,
                    channels,
                    scaleResolutions
                )
            ) {
                continue;
            } else {
                this.#addRulerOverlay(
                    paramName,
                    ruler,
                    channels,
                    scaleResolutions
                );
            }
        }
    }

    /**
     * @returns {GridChildRulerBinding[]}
     */
    #getRulerBindings() {
        /** @type {GridChildRulerBinding[]} */
        const bindings = [];
        const seen = new Set();

        for (const owner of this.view.getDataAncestors()) {
            for (const [paramName, param] of owner.paramRuntime.paramConfigs) {
                if (seen.has(paramName)) {
                    continue;
                }

                seen.add(paramName);
                if (isRulerParameter(param)) {
                    bindings.push({
                        owner,
                        paramName,
                        config: param.ruler,
                    });
                }
            }
        }

        return bindings;
    }

    /**
     * @param {import("../view.js").default} owner
     * @param {string} paramName
     * @param {import("../../spec/parameter.js").RulerConfig} ruler
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel[]} channels
     * @param {Partial<Record<import("../../spec/channel.js").PrimaryPositionalChannel, import("../../scales/scaleResolution.js").default>>} scaleResolutions
     */
    #usesContainerRulerOverlay(
        owner,
        paramName,
        ruler,
        channels,
        scaleResolutions
    ) {
        return (
            resolveRulerOverlayExtent({
                paramName,
                config: ruler,
                ownerSpec: owner.spec,
                channels,
                isAligned: (channel) =>
                    owner.getScaleResolution?.(channel) ===
                    scaleResolutions[channel],
            }) === "container"
        );
    }

    /**
     * @param {string} paramName
     * @param {import("../../spec/parameter.js").RulerConfig} ruler
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel[]} channels
     * @param {Partial<Record<import("../../spec/channel.js").PrimaryPositionalChannel, import("../../scales/scaleResolution.js").default>>} scaleResolutions
     */
    #addRulerOverlay(paramName, ruler, channels, scaleResolutions) {
        const overlay = createConfiguredRulerOverlayView({
            paramName,
            channels,
            config: ruler,
            scaleResolution: scaleResolutions[channels[0]],
            context: this.layoutParent.context,
            layoutParent: this.layoutParent,
            dataParent: this.view,
            name: "rulerOverlay" + this.#serial + "_" + paramName,
        });

        this.rulerOverlays.push(overlay);
    }

    async #initializeGeneratedOverlays() {
        if (!this.#generatedOverlaysInitialized) {
            const overlays = [
                ...(this.selectionRect ? [this.selectionRect] : []),
                ...this.rulerOverlays,
            ];

            await Promise.all(
                overlays.map((overlay) => overlay.view.initializeChildren())
            );
            this.#generatedOverlaysInitialized = true;
        }
    }

    /**
     * @param {string} paramName
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel[]} channels
     */
    #getRulerScaleResolutions(paramName, channels) {
        return Object.fromEntries(
            channels.map((channel) => {
                const resolution = this.view.getScaleResolution(channel);

                if (!resolution?.getResolvedScaleType?.()) {
                    throw new Error(
                        `No scale found for ruler param "${paramName}" on channel "${channel}".`
                    );
                }

                return [channel, resolution];
            })
        );
    }

    #setupIntervalSelection() {
        const view = this.view;

        // TODO: If the child is a LayerView, selection params should be pulled from its children as well
        for (const [name, param] of view.paramRuntime.paramConfigs) {
            if (!("select" in param)) {
                continue;
            }

            const select = asSelectionConfig(param.select);

            if (!isIntervalSelectionConfig(select)) {
                continue;
            }

            this.#intervalSelectionControllers.push(
                new IntervalSelectionController(this, name, param, select)
            );
        }
    }

    *getChildren() {
        if (this.background) {
            yield this.background;
        }
        if (this.backgroundStroke) {
            yield this.backgroundStroke;
        }
        if (this.title) {
            yield this.title;
        }
        for (const candidate of this.axisCandidates) {
            yield candidate.axisView;
        }
        yield* iterateLegendViews(this.legends);
        yield* Object.values(this.gridLines);
        yield this.view;
        yield* Object.values(this.scrollbars);
        if (this.selectionRect) {
            yield this.selectionRect.view;
        }
        for (const overlay of this.rulerOverlays) {
            yield overlay.view;
        }
    }

    /**
     * Create view decorations, grid lines, axes, etc.
     */
    async createAxes() {
        this.#disposeAxisViews();
        await this.#initializeGeneratedOverlays();

        const { view, axes, gridLines } = this;
        const parentChromePolicy = view.getParentGridChromePolicy();
        /**
         * @param {import("../../scales/axisResolution.js").default} r
         * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
         */
        const getAxisPropsWithDefaults = (r, channel) => {
            const propsWithoutDefaults = r.getAxisProps();
            if (propsWithoutDefaults === null) {
                return;
            }

            const props = propsWithoutDefaults
                ? { ...propsWithoutDefaults }
                : {};

            // Pick a default orient based on what is available.
            // This logic is needed for layer views that have independent axes.
            if (!props.orient) {
                for (const orient of CHANNEL_ORIENTS[channel]) {
                    if (!axes[orient]) {
                        props.orient = orient;
                        break;
                    }
                }
                if (!props.orient) {
                    throw new Error(
                        "No slots available for an axis! Perhaps a LayerView has more than two children?"
                    );
                }
            }

            props.title ??= r.getTitle();

            if (!CHANNEL_ORIENTS[channel].includes(props.orient)) {
                throw new Error(
                    `Invalid axis orientation "${props.orient}" on channel "${channel}"!`
                );
            }

            return props;
        };

        /**
         * @param {import("../../scales/axisResolution.js").default} r
         * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
         * @param {import("../view.js").default} axisParent
         */
        const createAxis = async (r, channel, axisParent) => {
            const props = getAxisPropsWithDefaults(r, channel);

            if (props) {
                if (axes[props.orient] && !this.allowDuplicateAxes()) {
                    throw new Error(
                        `An axis with the orient "${props.orient}" already exists!`
                    );
                }

                const axisView = new AxisView(
                    props,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent,
                    {
                        labelClipPolicy: this.getAxisLabelClipPolicy(
                            channel,
                            view
                        ),
                    }
                );
                axes[props.orient] ??= axisView;
                this.axisCandidates.push({
                    axisView,
                    channel,
                    orient: props.orient,
                    resolution: r,
                });
                await axisView.initializeChildren();
            }
        };

        /**
         * @param {import("../../scales/axisResolution.js").default} r
         * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
         * @param {import("../view.js").default} axisParent
         */
        const createAxisGrid = async (r, channel, axisParent) => {
            const props = getAxisPropsWithDefaults(r, channel);
            if (!props) {
                return;
            }

            const defaults = getConfiguredAxisDefaults(
                axisParent.getConfigScopes(),
                {
                    channel,
                    orient: props.orient,
                    type: /** @type {import("../../spec/channel.js").Type} */ (
                        r.scaleResolution.type
                    ),
                    style: props.style,
                }
            );
            const effectiveProps = {
                ...defaults,
                ...props,
            };

            if (effectiveProps.grid || effectiveProps.chromGrid) {
                const axisGridView = new AxisGridView(
                    effectiveProps,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent
                );
                gridLines[props.orient] = axisGridView;
                await axisGridView.initializeChildren();
            }
        };

        if (parentChromePolicy.axes) {
            // Handle children that have caught axis resolutions. Create axes for them.
            for (const channel of /** @type {import("../../spec/channel.js").PrimaryPositionalChannel[]} */ ([
                "x",
                "y",
            ])) {
                if (view.needsAxes[channel]) {
                    const r = view.resolutions.axis[channel];
                    if (!r) {
                        continue;
                    }

                    await createAxis(r, channel, view);
                }
            }

            // Handle gridlines of children. Note: children's axis resolution may be caught by
            // this view or some of this view's ancestors.
            for (const channel of /** @type {import("../../spec/channel.js").PrimaryPositionalChannel[]} */ ([
                "x",
                "y",
            ])) {
                if (
                    view.needsAxes[channel] &&
                    // Handle a special case where the child view has an excluded resolution
                    // but no scale or axis, e.g., when only values are used on a channel.
                    view.getConfiguredOrDefaultResolution(channel, "axis") !=
                        "excluded"
                ) {
                    const r = view.getAxisResolution(channel);
                    if (!r) {
                        continue;
                    }

                    await createAxisGrid(r, channel, view);
                }
            }

            // Handle LayerView's possible independent axes
            if (view instanceof LayerView) {
                // First create axes that have an orient preference
                for (const layerChild of view) {
                    for (const [channel, r] of Object.entries(
                        layerChild.resolutions.axis
                    )) {
                        const props = r.getAxisProps();
                        if (props && props.orient) {
                            await createAxis(r, channel, layerChild);
                        }
                    }
                }

                // Then create axes in a priority order
                for (const layerChild of view) {
                    for (const [channel, r] of Object.entries(
                        layerChild.resolutions.axis
                    )) {
                        const props = r.getAxisProps();
                        if (props && !props.orient) {
                            await createAxis(r, channel, layerChild);
                        }
                    }
                }

                // TODO: Axis grid
            }
        }

        for (const { definition, resolution } of getOrderedLegendEntries(
            getLegendOwners(view)
        )) {
            const legend = await createGridChildLegend(
                definition,
                this.layoutParent
            );
            await addLegendView(this.legends, legend, resolution);
        }

        // Axes are created after scales are resolved, so we need to resolve possible new scales here
        [
            ...this.axisCandidates.map((candidate) => candidate.axisView),
            ...Object.values(gridLines),
            ...iterateLegendViews(this.legends),
        ].forEach((v) =>
            v.visit((view) => {
                if (view instanceof UnitView) {
                    view.resolve("scale");
                }
            })
        );
    }

    /**
     * Allows subclasses such as SampleGridChild to keep multiple same-orient
     * axis candidates. Ordinary GridView behavior still rejects duplicates.
     *
     * @protected
     * @returns {boolean}
     */
    allowDuplicateAxes() {
        return false;
    }

    /**
     * @param {import("../../spec/axis.js").AxisOrient} orient
     * @returns {AxisCandidate | undefined}
     */
    getActiveAxisCandidate(orient) {
        // Later candidates win, matching the existing layer draw order.
        return this.#getActiveAxisCandidates(orient).at(-1);
    }

    /**
     * @param {import("../../spec/axis.js").AxisOrient} orient
     * @returns {AxisCandidate[]}
     */
    #getActiveAxisCandidates(orient) {
        return this.axisCandidates.filter(
            (candidate) =>
                candidate.orient === orient &&
                candidate.resolution.hasVisibleNonChromeMember()
        );
    }

    /**
     * Disposes GridChild-owned controllers and generated guide views.
     */
    dispose() {
        for (const controller of this.#intervalSelectionControllers) {
            controller.dispose();
        }
        for (const controller of this.#rulerViewportControllers) {
            controller.dispose();
        }
        for (const controller of this.#rulerMouseEventControllers) {
            controller.dispose();
        }
        this.#intervalSelectionControllers = [];
        this.#rulerViewportControllers = [];
        this.#rulerMouseEventControllers = [];

        this.#disposeAxisViews();
    }

    /**
     * Disposes axis and gridline views so axes can be recreated safely.
     */
    #disposeAxisViews() {
        for (const candidate of this.axisCandidates) {
            candidate.axisView.disposeSubtree();
        }

        for (const gridView of Object.values(this.gridLines)) {
            gridView.disposeSubtree();
        }

        disposeLegendViews(this.legends);

        this.axes = {};
        this.axisCandidates = [];
        this.gridLines = {};
        this.legends = {};
    }

    /**
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
     * @param {import("../view.js").default} view
     * @returns {import("../axisView.js").AxisLabelClipPolicy}
     */
    getAxisLabelClipPolicy(channel, view) {
        const configuredPolicy = view.options.axisLabelClipPolicy?.[channel];
        if (configuredPolicy) {
            return configuredPolicy;
        }

        return (channel === "x" &&
            (view.spec.viewportWidth != null ||
                this.layoutParent.spec.viewportWidth != null)) ||
            (channel === "y" &&
                (view.spec.viewportHeight != null ||
                    this.layoutParent.spec.viewportHeight != null))
            ? "anchor"
            : "pixel";
    }

    getOverhang() {
        // Axes and overhang should be mutually exclusive, so we can just add them together
        return this.#getGuideOverhang()
            .add(this.#getTitleOverhang())
            .add(this.view.getOverhang());
    }

    #getGuideOverhang() {
        const calculate = (
            /** @type {import("../../spec/axis.js").AxisOrient} */ orient
        ) => getExternalAxisOverhang(this.axes[orient]);
        const legend = (
            /** @type {import("../../spec/legend.js").LegendOrient} */ orient
        ) => getLegendOverhang(this.legends, orient);

        return new Padding(
            calculate("top") + legend("top"),
            calculate("right") + legend("right"),
            calculate("bottom") + legend("bottom"),
            calculate("left") + legend("left")
        );
    }

    #getTitleOverhang() {
        return this.title?.getOverhang() ?? Padding.zero();
    }

    getTitleZindex() {
        return this.title?.titleSpec.zindex ?? 1;
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {Rectangle} viewportCoords
     * @param {import("../../types/rendering.js").RenderingOptions} options
     */
    renderTitle(context, viewportCoords, options) {
        this.title?.render(
            context,
            this.#getTitleCoords(viewportCoords),
            options
        );
    }

    /**
     * Returns the frame used for rendering a view title. Reserved titles are
     * placed outside guide overhang orthogonally, while the title frame controls
     * the parallel anchor range.
     *
     * @param {Rectangle} viewportCoords
     */
    #getTitleCoords(viewportCoords) {
        const titleSpec = this.title?.titleSpec;
        if (!titleSpec) {
            return viewportCoords;
        }

        const guideCoords = viewportCoords.expand(this.#getGuideOverhang());
        const frame = titleSpec.frame ?? "group";
        if (titleSpec.reserve === false) {
            return frame == "bounds" ? guideCoords : viewportCoords;
        } else if (frame == "bounds") {
            return guideCoords;
        }

        switch (titleSpec.orient) {
            case "top":
            case "bottom":
                return guideCoords.modify({
                    x: () => viewportCoords.x,
                    width: () => viewportCoords.width,
                });
            case "left":
            case "right":
                return guideCoords.modify({
                    y: () => viewportCoords.y,
                    height: () => viewportCoords.height,
                });
            default:
                return viewportCoords;
        }
    }

    getOverhangAndPadding() {
        return this.getOverhang().add(this.view.getPadding());
    }
}

/**
 * @param {import("../../spec/view.js").ViewBackground} viewBackground
 * @returns {import("../../spec/view.js").UnitSpec}
 */
export function createBackground(viewBackground) {
    const fillOpacity =
        viewBackground?.fillOpacity ?? (viewBackground?.fill ? 1.0 : 0.0);
    const shadowOpacity = viewBackground?.shadowOpacity ?? 0.0;
    const required =
        (viewBackground?.fill && fillOpacity !== 0) || shadowOpacity !== 0;
    if (!required) {
        return;
    }

    return {
        data: { values: [{}] },
        mark: {
            color: viewBackground.fill,
            opacity: fillOpacity,
            type: "rect",
            clip: false, // Shouldn't be needed
            tooltip: null,
            minHeight: 1,
            minOpacity: 0,
            shadowBlur: viewBackground.shadowBlur,
            shadowColor: viewBackground.shadowColor,
            shadowOffsetX: viewBackground.shadowOffsetX,
            shadowOffsetY: viewBackground.shadowOffsetY,
            shadowOpacity: viewBackground.shadowOpacity,
        },
    };
}

/**
 * @param {import("../../spec/view.js").ViewBackground} viewBackground
 * @returns {import("../../spec/view.js").UnitSpec}
 */
export function createBackgroundStroke(viewBackground) {
    if (
        !viewBackground ||
        !viewBackground.stroke ||
        viewBackground.strokeWidth === 0 ||
        viewBackground.strokeOpacity === 0
    ) {
        return;
    }

    // Using rules to draw a non-filled rectangle.
    // We are not using a rect mark because it is not optimized for outlines.
    // TODO: Implement "hollow" mesh for non-filled rectangles
    return {
        resolve: {
            scale: { x: "excluded", y: "excluded" },
            axis: { x: "excluded", y: "excluded" },
        },
        data: {
            values: [
                { x: 0, y: 0, x2: 1, y2: 0 },
                { x: 1, y: 0, x2: 1, y2: 1 },
                { x: 1, y: 1, x2: 0, y2: 1 },
                { x: 0, y: 1, x2: 0, y2: 0 },
            ],
        },
        mark: {
            size: viewBackground.strokeWidth ?? 1.0,
            color: viewBackground.stroke ?? "lightgray",
            strokeCap: "square",
            opacity: viewBackground.strokeOpacity ?? 1.0,
            type: "rule",
            clip: "never",
            tooltip: null,
        },
        encoding: {
            x: { field: "x", type: "quantitative", scale: null },
            y: { field: "y", type: "quantitative", scale: null },
            x2: { field: "x2" },
            y2: { field: "y2" },
        },
    };
}
