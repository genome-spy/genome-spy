import { isRulerParameter } from "../../paramRuntime/paramUtils.js";
import {
    asSelectionConfig,
    isIntervalSelectionConfig,
} from "../../selection/selection.js";
import AxisGridView from "../axisGridView.js";
import AxisView, { CHANNEL_ORIENTS } from "../axisView.js";
import LayerView from "../layerView.js";
import Padding, { applyOverhangConfig } from "../layout/padding.js";
import Rectangle from "../layout/rectangle.js";
import TitleView, { getTitleCoords } from "../titleView.js";
import UnitView from "../unitView.js";
import {
    hasChromeAncestor,
    markViewAsChrome,
    markViewAsNonAddressable,
} from "../viewSelectors.js";
import Scrollbar from "./scrollbar.js";
import { getConfiguredViewBackground } from "../../config/viewConfig.js";
import { getConfiguredAxisDefaults } from "../../config/axisConfig.js";
import {
    createLegendViews,
    disposeLegendViews,
    iterateLegendViews,
    prepareLegendLayoutSize,
} from "./gridChildLegends.js";
import { getGuideOverhang } from "./legendLayout.js";
import { findLegendCollectionDeclaration } from "./legendCollection.js";
import { RulerMouseEventController } from "../../ruler/rulerMouseEventController.js";
import { RulerViewportController } from "../../ruler/rulerViewportController.js";
import { createConfiguredRulerOverlayView } from "./rulerOverlay.js";
import { IntervalSelectionController } from "./intervalSelectionController.js";
import { resolveOverlayExtent } from "./overlayExtent.js";
import {
    isConcatSpec,
    isFacetSpec,
    isHConcatSpec,
    isVConcatSpec,
} from "../viewSpecGuards.js";
import { isRulerGapChannel } from "../scaleProjection.js";
import { primaryPositionalChannels } from "../../encoder/encoder.js";

export { resolveIntervalZoomEventConfig } from "./intervalSelectionController.js";

/**
 * @typedef {{
 *     axisView: AxisView,
 *     channel: import("../../spec/channel.js").PrimaryPositionalChannel,
 *     orient: import("../../spec/axis.js").AxisOrient,
 *     resolution: import("../../scales/axisResolution.js").default,
 * }} AxisCandidate
 */

/**
 * @param {import("../view.js").default} view
 * @returns {import("../view.js").default[]}
 */
function getLegendOwners(view) {
    if (hasChromeAncestor(view)) {
        return [];
    } else if (view instanceof UnitView || isFacetSpec(view.spec)) {
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

/**
 * @param {import("../../spec/view.js").ViewSpec} spec
 */
function isAnyConcatSpec(spec) {
    return isVConcatSpec(spec) || isHConcatSpec(spec) || isConcatSpec(spec);
}

/**
 * @param {import("../view.js").default} view
 * @param {import("../../spec/channel.js").PrimaryPositionalChannel[]} channels
 */
function supportsRulerGapTracking(view, channels) {
    if (!isRulerGapChannel(view, channels)) {
        return false;
    }

    const channel = channels[0];
    const resolution = view.getScaleResolution(channel);
    return (
        resolution !== undefined &&
        /** @type {import("./gridView.js").default} */ (view).children.every(
            (child) => child.getScaleResolution(channel) === resolution
        )
    );
}

/**
 * @param {import("../../spec/view.js").UnitSpec | undefined} spec
 * @param {import("../containerView.js").default} layoutParent
 * @param {import("../view.js").default} dataParent
 * @param {string} name
 */
function createChromeView(spec, layoutParent, dataParent, name) {
    if (!spec) {
        return;
    }

    const view = new UnitView(
        spec,
        layoutParent.context,
        layoutParent,
        dataParent,
        name
    );
    markViewAsNonAddressable(view, { skipSubtree: true });
    markViewAsChrome(view, { skipSubtree: true });
    return view;
}

export default class GridChild {
    /**
     * Users guide:
     * - GridChild is owned by GridView and is not meant to be instantiated or
     *   managed directly by callers.
     * - Use GridView/ConcatView APIs for insertion/removal so decorations and
     *   dataflow are kept in sync.
     */

    /** @type {{ dispose: () => void }[]} */
    #controllers = [];

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

        /** @type {Rectangle} */
        this.plotCoords = Rectangle.ZERO;

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

            this.background = createChromeView(
                createBackground(viewBackground),
                layoutParent,
                view,
                "background" + serial
            );
            this.backgroundStroke = createChromeView(
                createBackgroundStroke(viewBackground),
                layoutParent,
                view,
                "backgroundStroke" + serial
            );
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

        if (!hasChromeAncestor(view)) {
            this.#setupIntervalSelection();
            this.#setupRulers();
        }

        // Cancel document drags before this view's parameter runtime is disposed.
        view.registerDisposer(() => this.#disposeControllers());
    }

    #setupRulers() {
        // The repeated child owns rulers and projects through the pointed cell.
        if (isFacetSpec(this.view.spec)) {
            return;
        }

        for (const { owner, paramName, param } of this.#getInheritedParams()) {
            if (!isRulerParameter(param)) {
                continue;
            }

            const ruler = param.ruler;
            const channels = ruler.encodings ?? ["x"];
            // The concat owner handles points in its inter-child gaps. Its
            // descendants still handle points inside their own plots.
            if (
                isAnyConcatSpec(this.view.spec) &&
                (ruler.source === "viewport" ||
                    owner !== this.view ||
                    !supportsRulerGapTracking(this.view, channels))
            ) {
                continue;
            }

            const scaleResolutions = this.#getRulerScaleResolutions(
                paramName,
                channels
            );

            if (ruler.source === "viewport") {
                this.#controllers.push(
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
                this.#controllers.push(
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
                this.#usesContainerOverlay(
                    owner,
                    channels,
                    ruler.extent,
                    `Ruler param "${paramName}"`
                )
            ) {
                continue;
            } else {
                this.rulerOverlays.push(
                    createConfiguredRulerOverlayView({
                        paramName,
                        channels,
                        config: ruler,
                        scaleResolution: scaleResolutions[channels[0]],
                        context: this.layoutParent.context,
                        layoutParent: this.layoutParent,
                        dataParent: this.view,
                        name: "rulerOverlay" + this.#serial + "_" + paramName,
                        expressionRuntime: owner.paramRuntime,
                    })
                );
            }
        }
    }

    /**
     * Iterates visible parameter declarations from nearest to farthest owner.
     *
     * @returns {IterableIterator<{
     *     owner: import("../view.js").default,
     *     paramName: string,
     *     param: import("../../spec/parameter.js").Parameter,
     * }>}
     */
    *#getInheritedParams() {
        const seen = new Set();

        for (const owner of this.view.getDataAncestors()) {
            for (const [paramName, param] of owner.paramRuntime.paramConfigs) {
                if (seen.has(paramName)) {
                    continue;
                }

                seen.add(paramName);
                yield { owner, paramName, param };
            }
        }
    }

    /**
     * @param {import("../view.js").default} owner
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel[]} channels
     * @param {"auto" | "view" | "container" | undefined} extent
     * @param {string} label
     */
    #usesContainerOverlay(owner, channels, extent, label) {
        return (
            resolveOverlayExtent({
                extent,
                ownerSpec: owner.spec,
                channels,
                isAligned: (channel) =>
                    owner.getScaleResolution?.(channel) ===
                    this.view.getScaleResolution(channel),
                label,
            }) === "container"
        );
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
        // The facet's repeated child wrapper owns its shared brush.
        if (isFacetSpec(this.view.spec)) {
            return;
        }

        for (const { owner, paramName, param } of this.#getInheritedParams()) {
            if (!("select" in param)) {
                continue;
            }

            const select = asSelectionConfig(param.select);
            if (
                !isIntervalSelectionConfig(select) ||
                (owner === this.view && isAnyConcatSpec(owner.spec))
            ) {
                continue;
            }

            const channels = select.encodings ?? ["x"];
            if (
                this.#usesContainerOverlay(
                    owner,
                    channels,
                    select.extent,
                    `Interval selection param "${paramName}"`
                )
            ) {
                continue;
            }

            this.#controllers.push(
                new IntervalSelectionController(
                    this,
                    paramName,
                    /** @type {import("../../spec/parameter.js").SelectionParameter<"interval">} */ (
                        param
                    ),
                    select,
                    owner.paramRuntime,
                    true
                )
            );
        }
    }

    get context() {
        return this.layoutParent.context;
    }

    /** @param {import("../layout/point.js").default} _point */
    getInteractionCoords(_point) {
        return this.coords.width > 0 && this.coords.height > 0
            ? this.coords
            : this.view.coords;
    }

    /**
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel} _channel
     * @param {import("../layout/point.js").default} _point
     */
    getProjectionCoords(_channel, _point) {
        return this.view.coords;
    }

    getSelectionRect() {
        return this.selectionRect;
    }

    /**
     * @param {import("./selectionRect.js").SelectionRectOverlay} overlay
     */
    setSelectionRect(overlay) {
        this.selectionRect = overlay;
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
     * Recreates GridChild-owned guide and generated chrome views.
     *
     * @param {{
     *     legendOwners?: import("../view.js").default[],
     *     legendFilter?: (legend: import("../legendView.js").default, owner: import("../view.js").default) => boolean
     * }} [options]
     */
    async syncGuideViews(options = {}) {
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

            const props = { ...propsWithoutDefaults };
            if (props.title === undefined) {
                props.title = r.getTitle();
            }

            // Pick a default orient based on what is available.
            // This logic is needed for layer views that have independent axes.
            if (!props.orient) {
                props.orient = CHANNEL_ORIENTS[channel].find(
                    (orient) => !axes[orient]
                );
                if (!props.orient) {
                    throw new Error(
                        "No slots available for an axis! Perhaps a LayerView has more than two children?"
                    );
                }
            }

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
            for (const channel of primaryPositionalChannels) {
                if (!view.needsAxes[channel]) {
                    continue;
                }

                const axisResolution = this.getAxisResolutionForAxis(channel);
                if (axisResolution) {
                    await createAxis(axisResolution, channel, view);
                }

                // Gridlines also follow axis resolutions caught by ancestors.
                if (
                    view.getConfiguredOrDefaultResolution(channel, "axis") !=
                    "excluded"
                ) {
                    const r = view.getAxisResolution(channel);
                    if (r) {
                        await createAxisGrid(r, channel, view);
                    }
                }
            }

            // Handle LayerView's possible independent axes
            if (view instanceof LayerView) {
                // Reserve explicit orientations before assigning free slots.
                for (const preferred of [true, false]) {
                    for (const layerChild of view) {
                        for (const [channel, r] of Object.entries(
                            layerChild.resolutions.axis
                        )) {
                            const props = r.getAxisProps();
                            if (props && Boolean(props.orient) === preferred) {
                                await createAxis(r, channel, layerChild);
                            }
                        }
                    }
                }

                // TODO: Axis grid
            }
        }

        await createLegendViews(
            this.legends,
            options.legendOwners ?? getLegendOwners(view),
            this.layoutParent,
            (owner, resolution) =>
                findLegendCollectionDeclaration(owner, resolution.channel) ===
                undefined,
            options.legendFilter
        );

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
     * Returns the axis resolution used for creating a rendered axis.
     * Subclasses may override this when the rendered child uses a resolution
     * caught by an ancestor.
     *
     * @protected
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
     */
    getAxisResolutionForAxis(channel) {
        return this.view.resolutions.axis[channel];
    }

    /**
     * @param {import("../../spec/axis.js").AxisOrient} orient
     * @returns {AxisCandidate | undefined}
     */
    getActiveAxisCandidate(orient) {
        // Later candidates win, matching the existing layer draw order.
        return this.axisCandidates
            .filter(
                (candidate) =>
                    candidate.orient === orient &&
                    candidate.resolution.isVisible()
            )
            .at(-1);
    }

    /**
     * Disposes GridChild-owned controllers and generated guide views.
     */
    dispose() {
        this.#disposeControllers();
        this.#disposeAxisViews();
    }

    #disposeControllers() {
        for (const controller of this.#controllers) {
            controller.dispose();
        }
        this.#controllers = [];
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

    /** @param {GridChild["axes"]} [axes] */
    getOverhang(axes = this.axes) {
        // Axes and overhang should be mutually exclusive, so we can just add them together
        return applyOverhangConfig(
            getGuideOverhang(axes, this.legends)
                .add(this.title?.getOverhang() ?? Padding.zero())
                .add(this.view.getOverhang()),
            this.view.spec.overhang,
            this.view.getStructuralOverhang()
        );
    }

    /**
     * Resolves width- or height-constrained legend wrapping.
     *
     * @param {number} width
     * @param {number} height
     * @returns {boolean}
     */
    prepareLegendLayoutSize(width, height) {
        return prepareLegendLayoutSize(this.legends, width, height);
    }

    /**
     * Returns the view-owned part of overhang after applying the view's
     * reservation policy. Local guide overhang is placed in separate grid
     * slots and is therefore not included here.
     *
     * @returns {Padding}
     */
    getViewOverhang() {
        return applyOverhangConfig(
            this.view.getOverhang(),
            this.view.spec.overhang,
            this.view.getStructuralOverhang()
        );
    }

    /** @param {Rectangle} [viewport] */
    getAxisCoords(viewport = this.coords) {
        return viewport.shrink(this.getViewOverhang());
    }

    getTitleZindex() {
        return this.title?.titleSpec.zindex ?? 1;
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {Rectangle} viewportCoords
     * @param {import("../../types/rendering.js").RenderingOptions} options
     * @param {GridChild["axes"]} [axes]
     */
    arrangeTitle(context, viewportCoords, options, axes = this.axes) {
        if (this.title) {
            this.title.arrange(
                context,
                getTitleCoords(
                    viewportCoords,
                    viewportCoords.expand(getGuideOverhang(axes, this.legends)),
                    this.title.titleSpec
                ),
                options
            );
        }
    }

    /** @param {GridChild["axes"]} [axes] */
    getOverhangAndPadding(axes = this.axes) {
        return this.getOverhang(axes).add(this.view.getPadding());
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
