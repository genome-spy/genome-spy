import { primaryPositionalChannels } from "../../encoder/encoder.js";
import {
    FlexDimensions,
    addPxToSizeDef,
    getLargestSize,
    getSizeDefMaxPx,
    getSizeDefMinPx,
    placeFlexItems,
    resolveItemSizes,
    parseSizeDef,
    sumSizeDefs,
} from "../layout/flexLayout.js";
import Grid from "../layout/grid.js";
import Padding from "../layout/padding.js";
import Rectangle from "../layout/rectangle.js";
import AxisView, { CHANNEL_ORIENTS } from "../axisView.js";
import ContainerView from "../containerView.js";
import ViewError from "../viewError.js";
import { VISIT_SKIP } from "../view.js";
import {
    propagateInteraction,
    propagateInteractionSurface,
} from "../interactionRouting.js";
import UnitView from "../unitView.js";
import { interactionToZoom } from "../zoom.js";
import GridChild from "./gridChild.js";
import {
    createGridArrangement,
    queueGridChild,
    DECORATION_ORDER,
    defaultAxisZindex,
    translateAxisCoords,
    getOuterAxes,
} from "./gridChildArrangement.js";
export { translateAxisCoords } from "./gridChildArrangement.js";
import KeyboardZoomController from "./keyboardZoomController.js";
import { arrangeLocalLegends, getGuideOverhang } from "./legendLayout.js";
import {
    createLegendViews,
    disposeLegendViews,
    prepareLegendLayoutSize,
} from "./gridChildLegends.js";
import {
    findLegendCollectionDeclaration,
    getLegendResolutionOwners,
} from "./legendCollection.js";
import SeparatorView, { resolveSeparatorProps } from "./separatorView.js";
import {
    getZoomableResolutions,
    getZoomInteractionTarget,
} from "./zoomNavigationUtils.js";
import { moveArrayItem, shallowArrayEquals } from "../../utils/arrayUtils.js";
import { isHConcatSpec, isVConcatSpec } from "../viewSpecGuards.js";
import {
    combineClipOptions,
    createClipOptions,
    normalizeClipOptions,
} from "../renderingContext/clipOptions.js";
import { isRulerParameter } from "../../paramRuntime/paramUtils.js";
import { createConfiguredRulerOverlayView } from "./rulerOverlay.js";
import { createSelectionRectOverlay } from "./selectionRect.js";
import { IntervalSelectionController } from "./intervalSelectionController.js";
import { resolveOverlayExtent } from "./overlayExtent.js";
import { getScaleProjectionCoords } from "../scaleProjection.js";
import { isInChromeSubtree } from "../viewChrome.js";
import {
    asSelectionConfig,
    createIntervalSelection,
    isIntervalSelection,
    isIntervalSelectionConfig,
} from "../../selection/selection.js";

const MAX_CONSTRAINT_LAYOUT_PASSES = 10;

// Nested layouts can differ by half a physical pixel after device-pixel
// snapping. Keep that harmless rounding from invalidating shared projections.
const HALF_PHYSICAL_PIXEL = 0.5;

/**
 * Returns the part of an allocated flex slot that fits in the layout extent.
 * Flex minimums may otherwise report more room than a constrained canvas has.
 *
 * @param {import("../layout/flexLayout.js").LocSize} locSize
 * @param {number} extent
 */
function getVisibleSlotSize(locSize, extent) {
    return Math.max(0, Math.min(locSize.size, extent - locSize.location));
}

/**
 * Treat an explicit concat/grid size as preferred available space while still
 * letting fixed children and guide chrome establish a larger minimum. This
 * mirrors flexbox behavior more closely than treating the explicit size as a
 * hard clipping bound.
 *
 * @param {import("../layout/flexLayout.js").SizeDef} preferred
 * @param {import("../layout/flexLayout.js").SizeDef} content
 * @returns {import("../layout/flexLayout.js").SizeDef}
 */
function combinePreferredAndContentSize(preferred, content) {
    const preferredGrow = preferred.grow ?? 0;
    const preferredPx = preferred.px ?? 0;
    const minPx = Math.max(
        getSizeDefMinPx(preferred),
        getSizeDefMinPx(content)
    );

    if (!preferredGrow) {
        return { px: Math.max(preferredPx, minPx), grow: 0 };
    }

    /** @type {import("../layout/flexLayout.js").SizeDef} */
    const size = {
        px: Math.max(preferredPx, content.px ?? 0),
        grow: preferredGrow,
    };

    if (minPx > (size.px ?? 0)) {
        size.minPx = minPx;
    }

    const preferredMaxPx = getSizeDefMaxPx(preferred);
    if (preferredMaxPx !== undefined && preferredMaxPx >= minPx) {
        size.maxPx = preferredMaxPx;
    }

    return size;
}

/**
 * Modeled after: https://vega.github.io/vega/docs/layout/
 *
 * This should take care of the following:
 * - Composition: [hv]concat / facet / repeat
 * - Views
 * - Axes
 * - Grid lines
 * - View background
 * - View titles
 * - Facet (column / row) titles
 * - Header / footer
 * - Zoom / pan
 * - Scrollable viewports (with scrollbars)
 * - And later on, brushing, legend(?)
 *
 * @template {import("../../spec/view.js").GridSpec} [TSpec=import("../../spec/view.js").GridSpec]
 * @extends {ContainerView<TSpec>}
 */
export default class GridView extends ContainerView {
    /**
     * Users guide:
     * - GridView owns GridChild instances and manages decorations and shared axes.
     * - Use ConcatView helpers for dynamic insertion/removal so dataflow and axes
     *   lifecycle stays consistent.
     */

    /**
     * @typedef {"row" | "column"} Direction
     * @typedef {"horizontal" | "vertical"} ScrollDirection
     *
     * @typedef {import("../view.js").default} View
     */

    /** */
    #columns = Infinity;

    #spacing = 10;

    /**
     * @type { GridChild[] }
     */
    #children = [];

    /**
     * Note: shared axes are not included in #children because we have to handle
     * toggleable view visibilities. For example, if the bottom view is suddenly hidden,
     * the axis should be shown in the view that takes its place as the new bottom view.
     *
     * @type { Partial<Record<import("../../spec/channel.js").PrimaryPositionalChannel, AxisView>> } }
     */
    #sharedAxes = {};

    /** @type {import("./gridChildLegends.js").GridChildLegends} */
    #sharedLegends = {};

    /** @type {((legend: import("../legendView.js").default, owner: View) => boolean) | undefined} */
    #legendFilter;

    #childSerial = 0;

    /** @type {Partial<Record<"horizontal" | "vertical", SeparatorView>>} */
    #separatorViews = {};

    /** @type {KeyboardZoomController | null} */
    #keyboardZoomController = null;

    /** @type {() => boolean} */
    #cancelActivePan = () => false;

    /** @type {{ overlay: import("./generatedChromeOverlay.js").GeneratedChromeOverlay, order: number, channel: import("../../spec/channel.js").PrimaryPositionalChannel, controller?: IntervalSelectionController }[]} */
    #containerOverlays = [];

    /**
     *
     * @param {TSpec} spec
     * @param {import("../../types/viewContext.js").default} context
     * @param {ContainerView} layoutParent
     * @param {View} dataParent
     * @param {string} name
     * @param {number} columns
     * @param {import("../view.js").ViewOptions} [options]
     */
    constructor(
        spec,
        context,
        layoutParent,
        dataParent,
        name,
        columns,
        options
    ) {
        super(spec, context, layoutParent, dataParent, name, options);
        this.spec = spec;

        this.#spacing = spec.spacing ?? 10;
        this.#columns = columns;

        const separatorProps = resolveSeparatorProps(
            "separator" in spec ? spec.separator : undefined
        );
        if (separatorProps) {
            for (const direction of getSeparatorDirections(
                /** @type {import("../../spec/view.js").AnyConcatSpec} */ (spec)
            )) {
                this.#separatorViews[direction] = new SeparatorView({
                    direction,
                    props: separatorProps,
                    context: this.context,
                    layoutParent: this,
                    dataParent: this,
                    getName: (prefix) => this.getNextAutoName(prefix),
                });
            }
        }

        if (!this.layoutParent) {
            this.#keyboardZoomController = new KeyboardZoomController({
                context: this.context,
                viewRoot: this,
            });
        }
    }

    /**
     * @param {View} view
     */
    appendChild(view) {
        this.appendChildView(view);
    }

    /**
     * Appends a child view without initializing dataflow or axes.
     * Intended for ConcatView when building the initial hierarchy.
     *
     * @param {View} view
     * @returns {GridChild}
     */
    appendChildView(view) {
        return this.insertChildViewAt(view, this.#children.length);
    }

    /**
     * Inserts a child view without initializing dataflow or axes.
     * Callers should create axes, initialize subtree data, and request layout.
     *
     * @param {View} view
     * @param {number} index
     * @returns {GridChild}
     */
    insertChildViewAt(view, index) {
        view.layoutParent ??= this;
        const gridChild = new GridChild(view, this, this.#childSerial);
        this.#childSerial++;
        this.#children.splice(index, 0, gridChild);
        this.invalidateSizeCache();
        return gridChild;
    }

    /**
     * Removes a child by instance and disposes its subtree.
     * Callers should sync shared axes and request layout.
     *
     * @param {View} view
     */
    removeChildView(view) {
        const index = this.#children.findIndex(
            (gridChild) => gridChild.view === view
        );
        if (index < 0) {
            throw new Error("Not my child view!");
        }
        this.removeChildAt(index);
    }

    /**
     * Removes a child by index and disposes its subtree.
     * Callers should sync shared axes and request layout.
     *
     * @param {number} index
     */
    removeChildAt(index) {
        const gridChild = this.#children[index];
        if (!gridChild) {
            throw new Error("Child index out of range!");
        }
        this.#disposeGridChild(gridChild);
        this.#children.splice(index, 1);
        this.invalidateSizeCache();
    }

    /**
     * Moves a child within the grid without disposing it.
     *
     * @param {number} fromIndex
     * @param {number} index Destination index after temporarily removing the child.
     */
    moveChildAt(fromIndex, index) {
        moveArrayItem(this.#children, fromIndex, index);
        this.invalidateSizeCache();
    }

    get visibleChildren() {
        return this.#children.filter((gridChild) =>
            gridChild.view.isConfiguredVisible()
        );
    }

    get layoutGrid() {
        return new Grid(this.visibleChildren.length, this.#columns ?? Infinity);
    }

    /**
     * @param {View[]} views
     */
    setChildren(views) {
        for (const gridChild of this.#children) {
            this.#disposeGridChild(gridChild);
        }
        this.#children = [];
        for (const view of views) {
            this.appendChild(view);
        }
        this.invalidateSizeCache();
    }

    /**
     * @param {GridChild} gridChild
     */
    #disposeGridChild(gridChild) {
        gridChild.view.assertCanDisposeSubtree();
        gridChild.dispose();
        for (const view of gridChild.getChildren()) {
            view.disposeSubtree();
        }
    }

    /**
     * Read-only view to children
     */
    get children() {
        return this.#children.map((gridChild) => gridChild.view);
    }

    get childCount() {
        return this.#children.length;
    }

    /**
     * Returns the annotation layer owned by this container, if any.
     *
     * @returns {import("../layerView.js").default | undefined}
     */
    getAnnotationLayer() {
        return undefined;
    }

    get view() {
        return this;
    }

    get captureInteractions() {
        return true;
    }

    /**
     * Preserve nearest parameter ownership when a nested view shadows a
     * container-owned interval selection.
     *
     * @param {string} name
     * @param {import("../layout/point.js").default} point
     */
    ownsInteraction(name, point) {
        const pointedChild = this.findPointedChild(point);
        if (!pointedChild) {
            return true;
        }

        if (
            pointedChild.view instanceof GridView &&
            !pointedChild.view.ownsInteraction(name, point)
        ) {
            return false;
        }

        for (const owner of pointedChild.view.getDataAncestors()) {
            if (owner === this) {
                return true;
            }
            if (owner.paramRuntime.paramConfigs.has(name)) {
                return false;
            }
        }

        return true;
    }

    getInteractionCoords() {
        const channel = this.#getConcatSharedChannel();
        if (channel && this.options.alignedChannel === channel) {
            return this.getTrackPlotGeometry(channel)?.viewport;
        }
        return channel
            ? getCrossTrackBounds(
                  this.visibleChildren,
                  this.#sharedAxes,
                  channel
              )
            : undefined;
    }

    /**
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
     */
    getProjectionCoords(channel) {
        const geometry = this.getTrackPlotGeometry(channel);
        if (!geometry) {
            throw new Error(
                `Cannot project a container interval on an empty ${channel} grid.`
            );
        }
        return geometry.content;
    }

    /**
     * Returns the plotting placements of visible track children. These
     * placements intentionally exclude this grid's guides and any nested
     * container annotations.
     *
     * @returns {{ content: Rectangle, viewport: Rectangle, views: UnitView[] }[]}
     */
    getTrackPlotPlacements() {
        /** @type {{ content: Rectangle, viewport: Rectangle, views: UnitView[] }[]} */
        const placements = [];

        for (const gridChild of this.visibleChildren) {
            if (gridChild.view instanceof GridView) {
                placements.push(...gridChild.view.getTrackPlotPlacements());
                continue;
            }

            /** @type {UnitView[]} */
            const trackViews = [];
            gridChild.view.visit((view) => {
                if (!view.isConfiguredVisible()) {
                    return VISIT_SKIP;
                }
                if (view instanceof UnitView && !isInChromeSubtree(view)) {
                    trackViews.push(view);
                }
            });

            if (trackViews.length === 0) {
                continue;
            }

            placements.push({
                content: gridChild.plotCoords,
                viewport: gridChild.coords,
                views: trackViews,
            });
        }

        return placements;
    }

    /**
     * Returns the shared plotting bounds used by container overlays and
     * interactions.
     *
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel} [channel]
     * @returns {{ content: Rectangle, viewport: Rectangle } | undefined}
     */
    getTrackPlotGeometry(channel) {
        if (channel && this.options.alignedChannel === channel) {
            const anchor = this.getAlignmentAnchor(channel);
            if (!anchor) return undefined;
            const bounds = getCrossTrackBounds(
                this.visibleChildren,
                this.#sharedAxes,
                channel
            );
            if (!bounds) return undefined;
            const interval = anchor.getAlignmentCoords(channel);
            const dimension = channel === "x" ? "width" : "height";
            const coords = bounds.modify({
                [channel]: interval[channel],
                [dimension]: interval[dimension],
            });
            // Future scrollable side groups must preserve distinct content and
            // viewport intervals here, sharing the alignment anchor's offset.
            return { content: coords, viewport: coords };
        }
        return this._cache("trackPlotGeometry/" + channel, () => {
            const placements = this.getTrackPlotPlacements().filter(
                ({ content, viewport }) =>
                    content.width > 0 &&
                    content.height > 0 &&
                    viewport.width > 0 &&
                    viewport.height > 0
            );
            if (placements.length === 0) {
                return undefined;
            }

            if (channel) {
                const alignmentTolerance =
                    HALF_PHYSICAL_PIXEL /
                    (typeof window === "undefined"
                        ? 1
                        : (window.devicePixelRatio ?? 1));
                const resolution = this.getScaleResolution(channel);
                const trackViews = new Set(
                    placements.flatMap(({ views }) => views)
                );
                if (
                    !resolution
                        ?.getOrderedMembers()
                        .some(({ view }) => trackViews.has(view))
                ) {
                    throw new Error(
                        `Container annotations require a shared ${channel} scale defined by tracks.`
                    );
                }
                const expectedSpan =
                    placements[0].content[channel === "x" ? "width" : "height"];
                const expectedStart =
                    placements[0].content[channel === "x" ? "x" : "y"];

                for (const placement of placements) {
                    for (const view of placement.views) {
                        if (view.getScaleResolution(channel) !== resolution) {
                            throw new Error(
                                `Container annotations require all visible tracks to use the shared ${channel} scale resolution.`
                            );
                        }
                    }

                    const span =
                        placement.content[channel === "x" ? "width" : "height"];
                    const start =
                        placement.content[channel === "x" ? "x" : "y"];
                    if (
                        Math.abs(span - expectedSpan) > alignmentTolerance ||
                        Math.abs(start - expectedStart) > alignmentTolerance
                    ) {
                        throw new Error(
                            `Container annotations require equal aligned visible plotting spans on the shared ${channel} axis.`
                        );
                    }
                }
            }

            const content = Rectangle.unionAll(
                placements.map(({ content }) => content)
            );
            const viewports = placements.map(({ viewport }) => viewport);
            const viewport = channel
                ? getCrossTrackBounds(
                      this.visibleChildren,
                      this.#sharedAxes,
                      channel
                  )
                : Rectangle.unionAll(viewports);
            if (!content || !viewport) {
                return undefined;
            }

            return {
                content,
                viewport,
            };
        });
    }

    /**
     * Restricts which legends this grid and its children physically host.
     * Semantic legend ownership and scale resolution remain unchanged.
     *
     * @param {((legend: import("../legendView.js").default, owner: View) => boolean) | undefined} filter
     */
    setLegendFilter(filter) {
        this.#legendFilter = filter;
    }

    /**
     * Recreates guide and chrome views that depend on the child hierarchy.
     * Shared guides always depend on the whole container. Grid-child guides can
     * be limited to newly inserted children during mutations.
     *
     * @param {{
     *   gridChildren?: GridChild[],
     *   legendOwners?: import("../view.js").default[]
     * }} [options]
     */
    async syncGuideViews(options = {}) {
        const gridChildren = options.gridChildren ?? this.#children;

        await Promise.all([
            this.#syncSharedAxes(),
            this.#syncSharedLegends(options.legendOwners),
            this.#syncContainerOverlays(),
        ]);
        await Promise.all(
            gridChildren.map((gridChild) =>
                gridChild.syncGuideViews({ legendFilter: this.#legendFilter })
            )
        );
        this.invalidateSizeCache();
    }

    /**
     * Recreates only GridView-owned legends.
     */
    async syncLegendViews() {
        await this.#syncSharedLegends(getLegendResolutionOwners(this));
        this.invalidateSizeCache();
    }

    /**
     * Recreates shared axes based on current axis resolutions.
     *
     * This is used after dynamic child insert/remove to keep shared axes in sync.
     */
    async #syncSharedAxes() {
        for (const axisView of Object.values(this.#sharedAxes)) {
            axisView.disposeSubtree();
        }
        this.#sharedAxes = {};

        /** @type {Promise<void>[]} */
        const promises = [];

        for (const channel of primaryPositionalChannels) {
            const r = this.resolutions.axis[channel];
            if (!r) {
                continue;
            }

            const props = r.getAxisProps();
            if (!props) {
                continue;
            }

            const propsWithDefaults = {
                title: r.getTitle(),
                orient: CHANNEL_ORIENTS[channel][0],
                ...props,
            };
            const axisView = new AxisView(
                propsWithDefaults,
                r.scaleResolution.type,
                this.context,
                this,
                this
            );
            promises.push(axisView.initializeChildren());
            this.#sharedAxes[channel] = axisView;
        }

        await Promise.all(promises);
    }

    /**
     * Recreates shared legends based on current legend resolutions.
     *
     * Shared legends are GridView-owned for the same reason as shared axes:
     * their placement is relative to the whole child grid, not any individual
     * GridChild.
     *
     * @param {import("../view.js").default[]} [owners]
     */
    async #syncSharedLegends(owners) {
        disposeLegendViews(this.#sharedLegends);
        this.#sharedLegends = {};
        await createLegendViews(
            this.#sharedLegends,
            owners ?? getLegendResolutionOwners(this),
            this,
            (owner, resolution) =>
                getLegendLayoutHost(owner, resolution.channel) === this,
            this.#legendFilter
        );
    }

    async #syncContainerOverlays() {
        this.#disposeContainerOverlays();

        /** @type {Promise<void>[]} */
        const promises = [];

        for (const [paramName, param] of this.paramRuntime.paramConfigs) {
            if ("select" in param) {
                const select = asSelectionConfig(param.select);
                if (!isIntervalSelectionConfig(select)) {
                    continue;
                }

                const channels = select.encodings ?? ["x"];
                const channel = this.#getContainerOverlayChannel(
                    channels,
                    select.extent,
                    `Interval selection param "${paramName}"`
                );
                if (!channel) {
                    continue;
                }

                const selectionExpr =
                    this.paramRuntime.createExpression(paramName);
                const selection = selectionExpr();
                if (!selection || !isIntervalSelection(selection)) {
                    this.paramRuntime.setValue(
                        paramName,
                        param.value
                            ? { type: "interval", intervals: param.value }
                            : createIntervalSelection(channels)
                    );
                }

                const overlay = createSelectionRectOverlay({
                    selectionExpr,
                    selectionExpression: paramName,
                    channels,
                    brushConfig: select.mark,
                    context: this.context,
                    layoutParent: this,
                    dataParent: this,
                    scaleResolutionSource: this,
                });
                this.#containerOverlays.push({
                    overlay,
                    order: DECORATION_ORDER.selectionRect,
                    channel,
                    controller: new IntervalSelectionController(
                        this,
                        paramName,
                        /** @type {import("../../spec/parameter.js").SelectionParameter<"interval">} */ (
                            param
                        ),
                        select,
                        this.paramRuntime,
                        false,
                        overlay
                    ),
                });
                promises.push(overlay.view.initializeChildren());
            } else if (
                isRulerParameter(param) &&
                param.ruler.display !== "none"
            ) {
                const channels = param.ruler.encodings ?? ["x"];
                const channel = this.#getContainerOverlayChannel(
                    channels,
                    param.ruler.extent,
                    `Ruler param "${paramName}"`
                );
                if (!channel) {
                    continue;
                }

                const overlay = createConfiguredRulerOverlayView({
                    paramName,
                    channels,
                    config: param.ruler,
                    scaleResolution: this.getScaleResolution(channel),
                    context: this.context,
                    layoutParent: this,
                    dataParent: this,
                    name: "rulerOverlay" + "_" + paramName,
                    expressionRuntime: this.paramRuntime,
                });
                this.#containerOverlays.push({
                    overlay,
                    order: DECORATION_ORDER.ruler,
                    channel,
                });
                promises.push(overlay.view.initializeChildren());
            }
        }

        await Promise.all(promises);
    }

    /**
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel[]} channels
     * @param {"auto" | "view" | "container" | undefined} extent
     * @param {string} label
     */
    #getContainerOverlayChannel(channels, extent, label) {
        if (channels.length !== 1) {
            return;
        }

        return resolveOverlayExtent({
            extent,
            ownerSpec: this.spec,
            channels,
            isAligned: (channel) => this.#hasAlignedOverlayProjection(channel),
            label,
        }) === "container"
            ? channels[0]
            : undefined;
    }

    /** @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel */
    #hasAlignedOverlayProjection(channel) {
        const ownerResolution = this.getScaleResolution(channel);
        return (
            ownerResolution != null &&
            this.#children.every(
                (gridChild) =>
                    gridChild.view.getScaleResolution(channel) ===
                    ownerResolution
            )
        );
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const gridChild of this.#children) {
            yield* gridChild.getChildren();
        }

        for (const { overlay } of this.#containerOverlays) {
            yield overlay.view;
        }

        const annotationLayer = this.getAnnotationLayer();
        if (annotationLayer) {
            yield annotationLayer;
        }

        for (const separatorView of Object.values(this.#separatorViews)) {
            yield separatorView.view;
        }

        for (const axisView of Object.values(this.#sharedAxes)) {
            yield axisView;
        }

        yield* Object.values(this.#sharedLegends);
    }

    /**
     * @param {Direction} direction
     */
    #getSizes(direction) {
        const dim = direction == "column" ? "width" : "height";
        const channel = direction === "column" ? "x" : "y";
        const edges =
            channel === "x"
                ? /** @type {const} */ ([
                      ["before", "left"],
                      ["after", "right"],
                  ])
                : /** @type {const} */ ([
                      ["before", "top"],
                      ["after", "bottom"],
                  ]);

        /**
         * @param {GridChild} child
         * @returns {import("../layout/flexLayout.js").SizeDef}
         */
        const getPlotSize = (child) => {
            if (this.alignsChild(child.view, channel)) {
                return child.view.getAlignment(channel).size;
            }
            // External overhang lives in separate slots.
            return addPxToSizeDef(
                child.view.getViewportSize()[dim],
                -child.getViewOverhang()[dim]
            );
        };

        return this._cache(`size/directionSizes/${direction}`, () =>
            this.layoutGrid[
                direction == "column" ? "colIndices" : "rowIndices"
            ].map((col) => {
                const children = col.map(
                    (index) => this.visibleChildren[index]
                );
                const insets = { before: 0, after: 0 };
                const totals = { before: 0, after: 0 };

                for (const child of children) {
                    const occupied = child.view.getStructuralOverhang();
                    const alignment = this.alignsChild(child.view, channel)
                        ? child.view.getAlignment(channel)
                        : {
                              before: occupied[edges[0][1]],
                              after: occupied[edges[1][1]],
                          };
                    const overhang = this.getChildOverhangAndPadding(child);
                    for (const [edge, side] of edges) {
                        insets[edge] = Math.max(insets[edge], alignment[edge]);
                        totals[edge] = Math.max(totals[edge], overhang[side]);
                    }
                }

                const structural = this.getTrackSizeAndInsets(
                    channel,
                    children,
                    getLargestSize(
                        this.getPlotSizeChildren(direction, children).map(
                            getPlotSize
                        )
                    ),
                    insets
                );
                // Replace measured insets with flex reservations, retaining
                // headroom and corner reuse from getTrackSizeAndInsets().
                // Their growth stays separate from the center's plot weight.
                const reservations = children.map((child) =>
                    child.view.getStructuralSizeDefs(channel)
                );

                return {
                    axisBefore: totals.before - insets.before,
                    axisAfter: totals.after - insets.after,
                    structuralBefore: structural.before,
                    structuralAfter: structural.after,
                    flexBefore: addPxToSizeDef(
                        getLargestSize(reservations.map((size) => size.before)),
                        structural.before - insets.before
                    ),
                    flexAfter: addPxToSizeDef(
                        getLargestSize(reservations.map((size) => size.after)),
                        structural.after - insets.after
                    ),
                    view: structural.size,
                };
            })
        );
    }

    /** @param {View} _view @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel */
    alignsChild(_view, channel) {
        return this.options.alignedChannel === channel;
    }

    /** @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel */
    getAlignmentAnchor(channel) {
        return this.options.alignedChannel === channel
            ? this.visibleChildren[0]?.view
            : undefined;
    }

    /**
     * Returns the plot size and structural space reserved before and after it.
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel} _channel
     * @param {GridChild[]} _children
     * @param {import("../layout/flexLayout.js").SizeDef} size
     * @param {{ before: number, after: number }} insets
     */
    getTrackSizeAndInsets(_channel, _children, size, insets) {
        return { size, ...insets };
    }

    /** @override @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel */
    getAlignment(channel) {
        const anchor = this.getAlignmentAnchor(channel);
        if (!anchor) {
            return super.getAlignment(channel);
        }
        return this._cache("size/alignment/" + channel, () => {
            const direction = channel === "x" ? "column" : "row";
            const index = this.visibleChildren.findIndex(
                (child) => child.view === anchor
            );
            const track =
                this.layoutGrid.getCellCoords(index)[channel === "x" ? 0 : 1];
            const items = this.getFlexItems(direction);
            const slot = this.getViewSlot(track);
            const before = items.slice(0, slot);
            const after = items.slice(slot + 1);
            if ([...before, ...after].some((size) => size.grow)) {
                const growingTrack = this.#getSizes(direction).findIndex(
                    (size, i) => i !== track && size.view.grow
                );
                const indices =
                    this.layoutGrid[
                        direction === "row" ? "rowIndices" : "colIndices"
                    ][growingTrack];
                const dimension = channel === "x" ? "width" : "height";
                const growingViews = indices
                    .flatMap((index) =>
                        this.visibleChildren[index].view.getDescendants()
                    )
                    .filter(
                        (view) =>
                            !isInChromeSubtree(view) &&
                            view.getSize()[dimension].grow
                    );
                const offender =
                    growingViews.find(
                        (view) => view.spec[dimension] !== undefined
                    ) ?? growingViews.at(-1);
                throw new ViewError(
                    "Nested aligned structural panels require fixed or step sizes.",
                    offender
                ).withSpecLocation(offender.spec, [dimension]);
            }
            const chrome = this.getGridOverhang();
            return {
                size: items[slot],
                before:
                    before.reduce(
                        (sum, size) => sum + getSizeDefMinPx(size),
                        0
                    ) - chrome[channel === "x" ? "left" : "top"],
                after:
                    after.reduce(
                        (sum, size) => sum + getSizeDefMinPx(size),
                        0
                    ) - chrome[channel === "x" ? "right" : "bottom"],
            };
        });
    }

    /** @override @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel */
    getAlignmentCoords(channel) {
        const anchor = this.getAlignmentAnchor(channel);
        return anchor
            ? anchor.getAlignmentCoords(channel)
            : super.getAlignmentCoords(channel);
    }

    /** @param {import("../layout/point.js").default} point */
    findPointedChild(point) {
        const candidates = this.visibleChildren.filter((child) =>
            child.coords.containsPoint(point.x, point.y)
        );
        if (!this.getAlignmentAnchor("x") && !this.getAlignmentAnchor("y")) {
            return candidates[0];
        }
        // A decorated board can have empty corners in its bounding box. Prefer
        // painted regions before considering any descendant's navigable gaps.
        return (
            candidates.find((child) =>
                child.view
                    .getLayoutFootprints()
                    .some(({ coords }) =>
                        coords.containsPoint(point.x, point.y)
                    )
            ) ??
            candidates.find(
                ({ view }) =>
                    view instanceof GridView &&
                    view.#containsInteractionPoint(point)
            )
        );
    }

    /** @param {import("../layout/point.js").default} point @returns {boolean} */
    #containsInteractionPoint(point) {
        return (
            (this.getInteractionCoords()?.containsPoint(point.x, point.y) ??
                false) ||
            this.visibleChildren.some(
                ({ view }) =>
                    view instanceof GridView &&
                    view.#containsInteractionPoint(point)
            )
        );
    }

    /** @override */
    getLayoutFootprints() {
        return this._cache("layoutFootprints", () => {
            /** @type {ReturnType<View["getLayoutFootprints"]>} */
            const footprints = [];
            /** @param {View} view @param {Rectangle} coords @param {boolean} [chrome] */
            const addFootprint = (view, coords, chrome = true) =>
                footprints.push({ view, coords, chrome });

            const grid = this.layoutGrid;
            for (const [i, child] of this.visibleChildren.entries()) {
                footprints.push(...child.view.getLayoutFootprints());
                const [column, row] = grid.getCellCoords(i);
                const axes = {
                    ...getOuterAxes(
                        Object.values(this.#sharedAxes),
                        column,
                        row,
                        grid
                    ),
                    ...child.axes,
                };
                for (const [orient, axis] of Object.entries(axes)) {
                    const chrome = getGuideOverhang({ [orient]: axis }, {});
                    for (const coords of edgeBands(
                        child.getAxisCoords(),
                        chrome
                    )) {
                        addFootprint(child.view, coords);
                    }
                }
                for (const coords of edgeBands(
                    child.coords.shrink(child.getViewOverhang()),
                    child.view.getPadding()
                )) {
                    addFootprint(child.view, coords);
                }
                for (const legend of Object.values(child.legends).filter(
                    (legend) => legend.isActive()
                )) {
                    addFootprint(child.view, legend.coords);
                }
                if (child.title) {
                    for (const coords of edgeBands(
                        child.title.coords,
                        child.title.getOverhang()
                    )) {
                        addFootprint(child.view, coords);
                    }
                }
                if (child.background) {
                    addFootprint(child.view, child.background.coords, false);
                }
            }
            for (const legend of Object.values(this.#sharedLegends).filter(
                (legend) => legend.isActive()
            )) {
                addFootprint(this, legend.coords);
            }
            return footprints;
        });
    }

    /**
     * Measures space reserved around a child's plot slots. Arrangement still
     * uses its full overhang, allowing specialized grids to reuse empty cells.
     * @protected
     * @param {GridChild} child
     */
    getChildOverhangAndPadding(child) {
        return child.getOverhangAndPadding();
    }

    /**
     * Selects the children contributing to a row or column's plot size.
     * Decorations from all children remain part of the measured overhang.
     * @protected
     * @param {Direction} direction
     * @param {GridChild[]} children
     * @returns {GridChild[]}
     */
    getPlotSizeChildren(direction, children) {
        return children;
    }

    /**
     * Each track has before-overhang, plot, and after-overhang slots, with
     * a spacing slot between adjacent tracks.
     *
     * @protected
     * @param {Direction} direction
     */
    getFlexItems(direction) {
        const sizes = this.#getSizes(direction);

        /** @type {import("../layout/flexLayout.js").SizeDef[]} */
        const items = [];

        for (const [i, size] of sizes.entries()) {
            if (i > 0) {
                // Spacing
                items.push({ px: this.#spacing, grow: 0 });
            }

            // Axis/padding
            items.push(addPxToSizeDef(size.flexBefore, size.axisBefore));

            // View
            items.push(size.view);

            // Axis/padding
            items.push(addPxToSizeDef(size.flexAfter, size.axisAfter));
        }

        return items;
    }

    /**
     * @param {Direction} direction
     * @return {import("../layout/flexLayout.js").SizeDef}
     */
    #getFlexSize(direction) {
        const explicitSize =
            direction == "row" ? this.spec.height : this.spec.width;
        const preferredSize =
            explicitSize || explicitSize === 0
                ? parseSizeDef(
                      this.resolveSizeValue(
                          direction == "row" ? "height" : "width",
                          explicitSize
                      )
                  )
                : undefined;
        const usePreferredAsViewSlot =
            preferredSize && this.#getSizes(direction).length === 1;
        const items = this.getFlexItems(direction);
        if (usePreferredAsViewSlot) {
            const slot = this.getViewSlot(0);
            items[slot] = combinePreferredAndContentSize(
                preferredSize,
                items[slot]
            );
        }

        const measuredSize = sumSizeDefs(items);
        return preferredSize && !usePreferredAsViewSlot
            ? combinePreferredAndContentSize(preferredSize, measuredSize)
            : measuredSize;
    }

    /** @protected @param {number} index Row or column index. */
    getViewSlot(index) {
        return 4 * index + 1;
    }

    /**
     * @return {Padding}
     */
    getOverhang() {
        return this.getGridOverhang()
            .add(this.#getSharedGuideOverhang())
            .add(this.getStructuralOverhang());
    }

    /** @override */
    getStructuralOverhang() {
        if (!this.visibleChildren.length) {
            return Padding.zero();
        }
        const x = this.getAlignmentAnchor("x")
            ? this.getAlignment("x")
            : {
                  before: this.#getSizes("column").at(0).structuralBefore,
                  after: this.#getSizes("column").at(-1).structuralAfter,
              };
        const y = this.getAlignmentAnchor("y")
            ? this.getAlignment("y")
            : {
                  before: this.#getSizes("row").at(0).structuralBefore,
                  after: this.#getSizes("row").at(-1).structuralAfter,
              };
        return new Padding(y.before, x.after, y.after, x.before);
    }

    /** @protected */
    getGridOverhang() {
        const cols = this.#getSizes("column");
        const rows = this.#getSizes("row");

        if (!cols.length || !rows.length) {
            return Padding.zero();
        }

        return new Padding(
            rows.at(0).axisBefore,
            cols.at(-1).axisAfter,
            rows.at(-1).axisAfter,
            cols.at(0).axisBefore
        );
    }

    #getSharedGuideOverhang() {
        return getGuideOverhang(
            this.#getSharedAxesByOrient(),
            this.#sharedLegends
        );
    }

    #getSharedAxesByOrient() {
        /** @type {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisView>>} */
        const axes = {};
        for (const axisView of Object.values(this.#sharedAxes)) {
            axes[axisView.axisProps.orient] = axisView;
        }

        return axes;
    }

    /**
     * @returns {FlexDimensions}
     */
    getSize() {
        return this._cache("size", () => {
            return new FlexDimensions(
                this.#getFlexSize("column"),
                this.#getFlexSize("row")
            ).addPadding(this.#getSharedGuideOverhang());
        });
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {import("../layout/rectangle.js").default} coords
     * @param {import("../../types/rendering.js").RenderingOptions} [options]
     */
    arrange(context, coords, options = {}) {
        this._invalidateCacheByPrefix("trackPlotGeometry");
        this._invalidateCacheByPrefix("layoutFootprints");
        super.arrange(context, coords, options);

        if (!this.isConfiguredVisible()) {
            return;
        }

        if (!this.layoutParent) {
            // Usually padding is applied by the parent GridView, but if this is the root view, we need to apply it here
            coords = coords.shrink(this.getPadding());
        }

        let sharedGuideOverhang = this.#getSharedGuideOverhang();
        let remainingSharedLayoutPasses = MAX_CONSTRAINT_LAYOUT_PASSES;
        while (true) {
            const plotCoords = coords.shrink(sharedGuideOverhang);
            const changed = prepareLegendLayoutSize(
                this.#sharedLegends,
                plotCoords.width,
                plotCoords.height
            );
            if (!changed) {
                coords = plotCoords;
                break;
            }

            remainingSharedLayoutPasses--;
            if (!remainingSharedLayoutPasses) {
                throw new Error("Shared legend layout did not settle.");
            }
            this.invalidateSizeCache();
            sharedGuideOverhang = this.#getSharedGuideOverhang();
        }

        context.pushView(this, coords);

        const devicePixelRatio = context.getDevicePixelRatio();

        const flexOpts = {
            devicePixelRatio,
        };
        /**
         * Coordinates and marginal panels must use the same constrained growth.
         * @param {Direction} direction
         * @param {number} extent
         */
        const allocate = (direction, extent) => {
            const items = this.getFlexItems(direction);
            const { sizes, growth } = resolveItemSizes(items, extent);
            return {
                coords: placeFlexItems(items, sizes, extent, flexOpts),
                growth,
            };
        };
        let columnLayout = allocate("column", coords.width);
        let rowLayout = allocate("row", coords.height);

        const grid = this.layoutGrid;

        let remainingLayoutPasses = MAX_CONSTRAINT_LAYOUT_PASSES;
        while (true) {
            let layoutChanged = false;
            for (const [i, gridChild] of this.visibleChildren.entries()) {
                const [col, row] = grid.getCellCoords(i);
                const colLocSize = columnLayout.coords[this.getViewSlot(col)];
                const rowLocSize = rowLayout.coords[this.getViewSlot(row)];
                const availableWidth = getVisibleSlotSize(
                    colLocSize,
                    coords.width
                );
                const availableHeight = getVisibleSlotSize(
                    rowLocSize,
                    coords.height
                );

                // Some child chrome depends on the final plot allocation.
                // Repeating both dimensions lets external legend rows and
                // columns converge when their overhangs affect each other.
                const viewLayoutChanged =
                    /** @type {{ prepareLayoutSize?: (width: number, height: number, columnGrowth: number, rowGrowth: number) => boolean }} */ (
                        gridChild.view
                    ).prepareLayoutSize?.(
                        availableWidth,
                        availableHeight,
                        columnLayout.growth,
                        rowLayout.growth
                    ) === true;
                const legendLayoutChanged = gridChild.prepareLegendLayoutSize(
                    availableWidth,
                    availableHeight
                );
                layoutChanged ||= viewLayoutChanged || legendLayoutChanged;
            }

            if (!layoutChanged) {
                break;
            }

            remainingLayoutPasses--;
            if (!remainingLayoutPasses) {
                throw new Error("Legend layout did not settle.");
            }

            this.invalidateSizeCache();
            columnLayout = allocate("column", coords.width);
            rowLayout = allocate("row", coords.height);
        }

        /** @param {number} x */
        const round = (x) =>
            Math.round(x * devicePixelRatio) / devicePixelRatio;

        // Compute layout once and then dispatch decorations around the content
        // arrangement pass without recomputing per-child coordinates.
        const layoutItems = [];

        for (const [i, gridChild] of this.visibleChildren.entries()) {
            const { view } = gridChild;

            const [col, row] = grid.getCellCoords(i);
            const colLocSize = columnLayout.coords[this.getViewSlot(col)];
            const rowLocSize = rowLayout.coords[this.getViewSlot(row)];

            const viewportSize = view.getViewportSize();
            const viewSize = view.getSize();

            const overhang = gridChild.getViewOverhang();

            const x = colLocSize.location - overhang.left;
            const y = rowLocSize.location - overhang.top;

            // TODO: Optimize for cases where viewportSize and viewSize have equal identity

            /**
             * @param {FlexDimensions} size
             * @param {"width" | "height"} dimension
             * @param {boolean} explicitViewport
             */
            const getLen = (size, dimension, explicitViewport = false) =>
                explicitViewport
                    ? size[dimension].grow
                        ? (dimension == "width" ? colLocSize : rowLocSize).size
                        : size[dimension].px
                    : (dimension == "width" ? colLocSize : rowLocSize).size +
                      overhang[dimension];

            const viewportWidth = getLen(
                viewportSize,
                "width",
                view.spec.viewportWidth != null
            );
            const viewportHeight = getLen(
                viewportSize,
                "height",
                view.spec.viewportHeight != null
            );
            const viewWidth = getLen(
                viewSize,
                "width",
                view.spec.viewportWidth != null
            );
            const viewHeight = getLen(
                viewSize,
                "height",
                view.spec.viewportHeight != null
            );

            const hScrollbar = gridChild.scrollbars.horizontal;
            const vScrollbar = gridChild.scrollbars.vertical;

            const viewportCoords = Rectangle.create(
                x,
                y,
                viewportWidth,
                viewportHeight
            ).translateBy(coords);

            const scrollable = view.isScrollable();

            const viewCoords = scrollable
                ? viewportCoords
                      .modify({ width: viewWidth, height: viewHeight })
                      .translate(
                          () => -round(hScrollbar?.viewportOffset ?? 0),
                          () => -round(vScrollbar?.viewportOffset ?? 0)
                      )
                : viewportCoords;

            gridChild.coords = viewportCoords;
            gridChild.plotCoords = viewCoords;

            layoutItems.push({
                col,
                row,
                viewportCoords,
                viewCoords,
                containerCoords: coords,
                gridChild,
            });
        }

        const gridOverhang = this.getGridOverhang();
        const gridViewCoords = Rectangle.unionAll(
            layoutItems.map((item) => item.viewCoords)
        );

        const arrangement = createGridArrangement();
        const { queueDecoration } = arrangement;

        for (const direction of /** @type {const} */ ([
            "vertical",
            "horizontal",
        ])) {
            const separator = this.#separatorViews[direction];
            if (!separator) {
                continue;
            }

            separator.update(
                direction === "vertical"
                    ? columnLayout.coords
                    : rowLayout.coords,
                direction === "vertical" ? grid.nCols : grid.nRows,
                coords,
                (index) => this.getViewSlot(index),
                gridOverhang
            );
            queueDecoration(
                separator.getZindex(),
                DECORATION_ORDER.separator,
                () => separator.arrange(context, coords, options)
            );
        }

        if (gridViewCoords) {
            for (const { overlay, order, channel } of this.#containerOverlays) {
                queueDecoration(overlay.zindex, order, () => {
                    // Foreground overlays share the completed track layout with
                    // annotations and controllers. Underlays precede nested layout.
                    const geometry =
                        overlay.zindex > 0
                            ? this.getTrackPlotGeometry(channel)
                            : undefined;
                    overlay.view.arrange(
                        context,
                        geometry?.content ??
                            getScaleProjectionCoords(
                                this.getScaleResolution(channel),
                                channel,
                                gridViewCoords,
                                this
                            ),
                        options
                    );
                });
            }
        }

        for (const item of layoutItems) {
            const { gridChild, viewportCoords, col, row } = item;
            const sharedAxes = getOuterAxes(
                Object.values(this.#sharedAxes),
                col,
                row,
                grid
            );
            const clippedDecorations = queueGridChild(
                context,
                item,
                options,
                arrangement,
                { ...sharedAxes, ...gridChild.axes }
            );
            // Axes shared between children
            // TODO: What if some have scrollable viewports?
            // Should throw an error because cannot have shared axes in such cases.
            for (const axisView of Object.values(sharedAxes)) {
                const props = axisView.axisProps;
                const orient = props.orient;
                queueDecoration(
                    defaultAxisZindex(axisView.axisProps, clippedDecorations),
                    DECORATION_ORDER.axis,
                    () => {
                        const host = gridChild.getAxisCoords(viewportCoords);
                        axisView.arrange(
                            context,
                            translateAxisCoords(host, orient, axisView),
                            options
                        );
                    }
                );
            }
        }

        // A declared scale can keep its guide even when the grid has no tracks.
        if (!layoutItems.length) {
            for (const axis of Object.values(this.#sharedAxes)) {
                const { orient } = axis.axisProps;
                const axisCoords = translateAxisCoords(coords, orient, axis);

                queueDecoration(
                    defaultAxisZindex(axis.axisProps, false),
                    DECORATION_ORDER.axis,
                    () => axis.arrange(context, axisCoords, options)
                );
            }
        }

        arrangeLocalLegends(
            this.#sharedLegends,
            this.#getSharedAxesByOrient(),
            coords,
            context,
            options,
            queueDecoration,
            DECORATION_ORDER.legend
        );

        arrangement.arrange();

        const annotationLayer = this.getAnnotationLayer();
        const annotationGeometry = annotationLayer
            ? this.getTrackPlotGeometry(this.#getConcatSharedChannel())
            : undefined;
        if (annotationLayer && annotationGeometry) {
            const parentClip = normalizeClipOptions(options);
            const annotationClip = combineClipOptions(
                parentClip,
                createClipOptions(annotationGeometry.viewport, true, true)
            );
            annotationLayer.arrange(context, annotationGeometry.content, {
                ...options,
                clipRect: annotationClip?.rect,
                clip: annotationClip,
            });
        }

        context.popView(this);
    }

    dispose() {
        this.#cancelActivePan();
        for (const { controller } of this.#containerOverlays) {
            controller?.dispose();
        }
        super.dispose();
    }

    #disposeContainerOverlays() {
        for (const { controller, overlay } of this.#containerOverlays) {
            controller?.dispose();
            overlay.view.disposeSubtree();
        }
        this.#containerOverlays = [];
    }

    /**
     * @param {import("../../utils/interaction.js").default} event
     */
    propagateInteraction(event) {
        propagateInteraction(this, event, () => {
            const pointedChild = this.findPointedChild(event.point);
            const pointedView = pointedChild?.view;

            const isWheelProbe = event.type === "wheelclaimprobe";
            if (!isWheelProbe) {
                this.#keyboardZoomController?.handlePointerEvent(
                    pointedChild,
                    event
                );

                for (const scrollbar of Object.values(
                    pointedChild?.scrollbars ?? {}
                )) {
                    propagateInteractionSurface(
                        event,
                        () =>
                            scrollbar.coords.containsPoint(
                                event.point.x,
                                event.point.y
                            ),
                        () => scrollbar.propagateInteraction(event)
                    );

                    if (event.stopped) {
                        return;
                    }
                }
            }

            const annotationLayer = this.getAnnotationLayer();
            const annotationCoords = annotationLayer
                ? this.getTrackPlotGeometry(this.#getConcatSharedChannel())
                      ?.viewport
                : undefined;
            const pointedAnnotation =
                annotationLayer &&
                annotationCoords?.containsPoint(event.point.x, event.point.y) &&
                this.context
                    .getCurrentHover()
                    ?.mark?.unitView?.getLayoutAncestors()
                    .includes(annotationLayer);
            if (pointedAnnotation) {
                annotationLayer.propagateInteraction(event);
                if (event.stopped || (isWheelProbe && event.wheelClaimed)) {
                    return;
                }
            }

            if (isWheelProbe) {
                this.#propagateWheelClaimProbe(event, pointedChild);
                return;
            }

            if (!pointedView) {
                const gapZoomTarget = this.#getGapZoomTarget(event.point);
                if (gapZoomTarget) {
                    this.#propagateZoomInteraction(
                        event,
                        gapZoomTarget.coords,
                        gapZoomTarget.zoomableResolutions
                    );
                } else if (
                    event.type === "mousedown" &&
                    (this.#findScrollbar("vertical") ||
                        this.#findScrollbar("horizontal"))
                ) {
                    // No zoomable shared scale in the gap, but an enclosing
                    // viewport can still be scrolled by dragging from here.
                    this.#propagateZoomInteraction(event, Rectangle.ZERO, {
                        x: new Set(),
                        y: new Set(),
                    });
                }
                return;
            }

            propagateInteractionSurface(
                event,
                () => true,
                () => pointedView.propagateInteraction(event),
                () => {
                    if (
                        event.type !== "wheel" &&
                        event.type !== "mousedown" &&
                        event.type !== "touchgesture"
                    ) {
                        return;
                    }
                    const target = getZoomInteractionTarget(
                        pointedView,
                        event.point,
                        pointedChild.coords
                    );
                    if (target) {
                        this.#propagateZoomInteraction(
                            event,
                            target.coords,
                            getZoomableResolutions(target.view),
                            pointedChild
                        );
                    }
                }
            );
        });
    }

    /**
     * Claims a wheel only when the pointed surface would consume a wheel zoom.
     *
     * @param {import("../../utils/interaction.js").default} event
     * @param {GridChild | undefined} pointedChild
     */
    #propagateWheelClaimProbe(event, pointedChild) {
        const pointedView = pointedChild?.view;
        pointedView?.propagateInteraction(event);
        if (event.stopped || event.wheelClaimed) {
            return;
        }

        if (event.wheelIntent === "scroll") {
            // Claim on unwind so intervening containers, including App sample
            // scrolling, get priority over this enclosing viewport.
            const scrollbar = pointedChild?.scrollbars.vertical;
            const scroll = scrollbar?.getWheelScroll(event.wheelEvent);
            if (scroll) {
                event.claimWheel(scrollbar, { scroll });
            }
            return;
        }

        if (!pointedView) {
            if (this.#getGapZoomTarget(event.point)) {
                event.claimWheel(this);
            }
            return;
        }

        const target = getZoomInteractionTarget(pointedView, event.point);
        if (!target) {
            return;
        }

        const zoomableResolutions = getZoomableResolutions(target.view);
        if (
            Object.values(zoomableResolutions).some(
                (resolutions) => resolutions.size > 0
            )
        ) {
            event.claimWheel(target.view);
        }
    }

    /**
     * @param {import("../layout/point.js").default} point
     * @returns {{ coords: Rectangle, zoomableResolutions: ReturnType<typeof getZoomableResolutions> } | undefined}
     */
    #getGapZoomTarget(point) {
        const channel = this.#getConcatSharedChannel();
        if (!channel) {
            return;
        }

        const resolution = this.getScaleResolution(channel);
        if (!resolution?.isZoomable()) {
            return;
        }

        const coords = this.getInteractionCoords();
        if (!coords?.containsPoint(point.x, point.y)) {
            return;
        }

        /** @type {ReturnType<typeof getZoomableResolutions>} */
        const zoomableResolutions = { x: new Set(), y: new Set() };
        zoomableResolutions[channel].add(resolution);

        return {
            coords,
            zoomableResolutions,
        };
    }

    /**
     * @returns {import("../../spec/channel.js").PrimaryPositionalChannel | undefined}
     */
    #getConcatSharedChannel() {
        return isVConcatSpec(this.spec)
            ? "x"
            : isHConcatSpec(this.spec)
              ? "y"
              : undefined;
    }

    /**
     * @param {import("../../utils/interaction.js").default} event
     * @param {Rectangle} coords
     * @param {ReturnType<typeof getZoomableResolutions>} zoomableResolutions
     * @param {GridChild} [pointedChild] the child under the pointer, if any
     */
    #propagateZoomInteraction(
        event,
        coords,
        zoomableResolutions,
        pointedChild
    ) {
        event.target ??= this;

        // A mouse drag on an axis without a zoomable scale scrolls the
        // innermost scrollable viewport containing the pointer in that
        // direction. Zoomable scales keep priority: their viewport can still
        // be scrolled with the scrollbar. Wheel and touch input are unchanged.
        /** @type {{ x?: import("./scrollbar.js").default, y?: import("./scrollbar.js").default }} */
        const dragScrollbars =
            event.type === "mousedown"
                ? {
                      x: zoomableResolutions.x.size
                          ? undefined
                          : this.#findScrollbar("horizontal", pointedChild),
                      y: zoomableResolutions.y.size
                          ? undefined
                          : this.#findScrollbar("vertical", pointedChild),
                  }
                : {};

        const hover = this.context.getCurrentHover();
        const sameFacet =
            !event.facetId ||
            (hover?.facetId &&
                shallowArrayEquals(event.facetId, hover.facetId));
        const cancelPan = interactionToZoom(
            event,
            coords,
            (zoomEvent) => {
                const zoomed = zoomResolutions(
                    coords,
                    zoomEvent,
                    zoomableResolutions,
                    this.context.animator
                );
                const scrolledX = scrollBy(dragScrollbars.x, zoomEvent.xDelta);
                const scrolledY = scrollBy(dragScrollbars.y, zoomEvent.yDelta);
                if (scrolledX || scrolledY) {
                    this.context.animator.requestRender();
                }
                return zoomed || scrolledX || scrolledY;
            },
            sameFacet ? hover : undefined,
            this.context.animator,
            // When dragging can scroll, lock to one axis so that a vertical
            // drag doesn't also pan horizontally (and vice versa).
            { lockAxis: Boolean(dragScrollbars.x || dragScrollbars.y) }
        );
        if (cancelPan) {
            this.#cancelActivePan();
            this.#cancelActivePan = cancelPan;
        }
    }

    /**
     * Finds the innermost scrollbar in the given direction whose viewport
     * contains the pointed child (or this view) and actually overflows.
     * Viewports whose content fits are skipped, so an enclosing viewport can
     * receive the drag.
     *
     * @param {import("./scrollbar.js").ScrollDirection} direction
     * @param {GridChild} [pointedChild]
     * @returns {import("./scrollbar.js").default | undefined}
     */
    #findScrollbar(direction, pointedChild) {
        /** @type {View} */
        let view = pointedChild?.view ?? this;
        for (
            let parent = view.layoutParent;
            parent;
            parent = parent.layoutParent
        ) {
            if (parent instanceof GridView) {
                const scrollbar = parent.#children.find(
                    (gridChild) => gridChild.view === view
                )?.scrollbars[direction];
                if (scrollbar?.canScroll()) {
                    return scrollbar;
                }
            }
            view = parent;
        }
    }

    /**
     * @param {import("../../spec/channel.js").Channel} channel
     * @param {import("../../spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("../../spec/view.js").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        return "independent";
    }
}

/**
 * Resolves the physical grid host separately from semantic collection routing.
 * Keeping this GridView-specific operation here avoids a module cycle with the
 * routing helper.
 *
 * @param {View} declaration
 * @param {import("../../spec/channel.js").ChannelWithScale} channel
 * @returns {GridView}
 */
export function getLegendCollectionLayoutHost(declaration, channel) {
    const host = declaration
        .getLayoutAncestors()
        .find((ancestor) => ancestor instanceof GridView);
    if (!host) {
        throw new Error(
            `Legend collection for channel "${channel}" declared at view "${declaration.name}" requires a GridView layout host.`
        );
    }
    return host;
}

/**
 * Resolves the physical host for a legend while leaving its semantic
 * resolution owner unchanged.
 *
 * Annotation views are deliberately not GridChild instances. Their legends
 * therefore use the nearest concat that owns their annotation layer, while
 * ordinary child legends continue to be hosted by their GridChild. Explicit
 * collection declarations take precedence over this annotation fallback.
 *
 * @param {View} owner
 * @param {import("../../spec/channel.js").ChannelWithScale} channel
 * @returns {GridView | undefined}
 */
export function getLegendLayoutHost(owner, channel) {
    const declaration = findLegendCollectionDeclaration(owner, channel);
    if (declaration) {
        return getLegendCollectionLayoutHost(declaration, channel);
    }

    const layoutAncestors = owner.getLayoutAncestors();
    for (const ancestor of layoutAncestors) {
        if (!(ancestor instanceof GridView)) {
            continue;
        }

        const annotationLayer = ancestor.getAnnotationLayer();
        if (annotationLayer && layoutAncestors.includes(annotationLayer)) {
            return ancestor;
        }
    }

    return owner instanceof GridView ? owner : undefined;
}

/**
 * Scrolls by a drag movement: dragging down (positive delta) pulls the content
 * down, revealing what is above, like panning. Clamped to the scrollable range.
 *
 * @param {import("./scrollbar.js").default | undefined} scrollbar
 * @param {number} delta drag movement in pixels
 * @returns {boolean} whether the scroll position changed
 */
function scrollBy(scrollbar, delta) {
    if (!scrollbar || !delta) {
        return false;
    }
    const previous = scrollbar.viewportOffset;
    // Cancel a scrollbar-thumb animation still in progress: its queued frames
    // would otherwise overwrite this position.
    scrollbar.interpolateViewportOffset.stop();
    // Keeps the thumb-drag smoother in sync with the new position
    scrollbar.setViewportOffset(previous - delta, { syncSmoother: true });
    return scrollbar.viewportOffset !== previous;
}

/**
 * @param {Rectangle} coords
 * @param {import("../zoom.js").ZoomEvent} zoomEvent
 * @param {ReturnType<typeof getZoomableResolutions>} zoomableResolutions
 * @param {import("../../utils/animator.js").default} animator
 */
function zoomResolutions(coords, zoomEvent, zoomableResolutions, animator) {
    let zoomable = false;
    let changed = false;

    const p = coords.normalizePoint(zoomEvent.x, zoomEvent.y);
    const tp = coords.normalizePoint(
        zoomEvent.x + zoomEvent.xDelta,
        zoomEvent.y + zoomEvent.yDelta
    );
    const delta = {
        x: tp.x - p.x,
        y: tp.y - p.y,
    };

    for (const [channel, resolutionSet] of Object.entries(
        zoomableResolutions
    )) {
        if (resolutionSet.size <= 0) {
            continue;
        }

        zoomable = true;

        for (const resolution of resolutionSet) {
            const resolutionChanged = resolution.zoom(
                2 ** zoomEvent.zDelta,
                channel == "y" ? 1 - p[channel] : p[channel],
                channel == "x" ? delta.x : -delta.y,
                channel == "x" ? coords.width : coords.height
            );
            changed = resolutionChanged || changed;
        }
    }

    if (changed) {
        animator.requestRender();
    }

    return zoomable;
}

/**
 * @param {import("../../spec/view.js").AnyConcatSpec} spec
 * @returns {("horizontal" | "vertical")[]}
 */
function getSeparatorDirections(spec) {
    // vconcat = horizontal separators, hconcat = vertical separators, concat = both
    if ("vconcat" in spec) {
        return ["horizontal"];
    }

    if ("hconcat" in spec) {
        return ["vertical"];
    }

    return ["horizontal", "vertical"];
}

/**
 * Intersects the aligned channel and unions the perpendicular channel.
 *
 * @param {GridChild[]} gridChildren
 * @param {Partial<Record<import("../../spec/channel.js").PrimaryPositionalChannel, AxisView>>} sharedAxes
 * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
 * @returns {Rectangle | undefined}
 */
function getCrossTrackBounds(gridChildren, sharedAxes, channel) {
    if (gridChildren.length === 0) {
        return undefined;
    }

    /** @type {[
     *   "x" | "y",
     *   "x2" | "y2",
     *   "x" | "y",
     *   "x2" | "y2",
     *   "top" | "left",
     *   "bottom" | "right"
     * ]} */
    const [aligned, alignedEnd, perpendicular, perpendicularEnd, start, end] =
        channel == "x"
            ? ["x", "x2", "y", "y2", "top", "bottom"]
            : ["y", "y2", "x", "x2", "left", "right"];
    let alignedMin = -Infinity;
    let alignedMax = Infinity;
    let perpendicularMin = Infinity;
    let perpendicularMax = -Infinity;

    for (const gridChild of gridChildren) {
        const { coords } = gridChild;
        const overhang = gridChild.getOverhang();
        alignedMin = Math.max(alignedMin, coords[aligned]);
        alignedMax = Math.min(alignedMax, coords[alignedEnd]);
        perpendicularMin = Math.min(
            perpendicularMin,
            coords[perpendicular] - overhang[start]
        );
        perpendicularMax = Math.max(
            perpendicularMax,
            coords[perpendicularEnd] + overhang[end]
        );
    }

    const axisOrients = [start, end];
    for (const axisView of Object.values(sharedAxes)) {
        const coords = axisView.coords;
        if (!coords || !axisOrients.includes(axisView.axisProps.orient)) {
            continue;
        }

        perpendicularMin = Math.min(perpendicularMin, coords[perpendicular]);
        perpendicularMax = Math.max(perpendicularMax, coords[perpendicularEnd]);
    }

    const alignedIndex = aligned == "x" ? 0 : 1;
    const min = [perpendicularMin, perpendicularMin];
    const max = [perpendicularMax, perpendicularMax];
    min[alignedIndex] = alignedMin;
    max[alignedIndex] = alignedMax;
    if (min[0] >= max[0] || min[1] >= max[1]) {
        return undefined;
    }

    return Rectangle.create(min[0], min[1], max[0] - min[0], max[1] - min[1]);
}

/** @param {Rectangle} rect @param {Padding} padding */
function edgeBands(rect, padding) {
    return [
        Rectangle.create(rect.x, rect.y - padding.top, rect.width, padding.top),
        Rectangle.create(rect.x2, rect.y, padding.right, rect.height),
        Rectangle.create(rect.x, rect.y2, rect.width, padding.bottom),
        Rectangle.create(
            rect.x - padding.left,
            rect.y,
            padding.left,
            rect.height
        ),
    ].filter((rect) => rect.width > 0 && rect.height > 0);
}
