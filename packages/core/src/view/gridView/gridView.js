import { primaryPositionalChannels } from "../../encoder/encoder.js";
import {
    FlexDimensions,
    getLargestSize,
    getSizeDefMaxPx,
    getSizeDefMinPx,
    mapToPixelCoords,
    parseSizeDef,
    ZERO_SIZEDEF,
} from "../layout/flexLayout.js";
import Grid from "../layout/grid.js";
import Padding from "../layout/padding.js";
import Rectangle from "../layout/rectangle.js";
import AxisView, {
    CHANNEL_ORIENTS,
    ORIENT_CHANNELS,
    getExternalAxisOverhang,
} from "../axisView.js";
import ContainerView from "../containerView.js";
import {
    propagateInteraction,
    propagateInteractionSurface,
} from "../interactionRouting.js";
import LayerView from "../layerView.js";
import UnitView from "../unitView.js";
import { interactionToZoom } from "../zoom.js";
import GridChild from "./gridChild.js";
import KeyboardZoomController from "./keyboardZoomController.js";
import { renderLocalLegends } from "./legendLayout.js";
import {
    addLegendView,
    createGridChildLegend,
    disposeLegendViews,
    getLegendOverhang,
    getOrderedLegendEntries,
    iterateLegendViews,
    isActiveLegendRegion,
} from "./gridChildLegends.js";
import SeparatorView, { resolveSeparatorProps } from "./separatorView.js";
import { getZoomableResolutions } from "./zoomNavigationUtils.js";
import { moveArrayItem } from "../../utils/arrayUtils.js";
import { isHConcatSpec, isVConcatSpec } from "../viewSpecGuards.js";
import {
    clipCoords,
    combineClipOptions,
    createClipOptions,
    normalizeClipOptions,
} from "../renderingContext/clipOptions.js";
import { isRulerParameter } from "../../paramRuntime/paramUtils.js";
import { createConfiguredRulerOverlayView } from "./rulerOverlay.js";
import { createSelectionRectOverlay } from "./selectionRect.js";
import { resolveOverlayExtent } from "./overlayExtent.js";
import {
    asSelectionConfig,
    createIntervalSelection,
    isIntervalSelection,
    isIntervalSelectionConfig,
} from "../../selection/selection.js";

// Secondary ordering within a z-index bucket for GridView-owned decorations.
// These are not z-indices themselves: actual layering is decided first by the
// decoration's zindex (underlay vs overlay relative to content), and these
// values are only used as tie-break phases among decorations in the same batch.
const DECORATION_ORDER = Object.freeze({
    background: 0,
    separator: 10,
    grid: 20,
    backgroundStroke: 30,
    axis: 40,
    legend: 50,
    selectionRect: 80,
    ruler: 82,
    scrollbar: 90,
    title: 100,
});

// Default z-index for axes and view strokes when the content is clipped or
// scrollable. This keeps guides above content-edge artifacts while still
// letting an explicit user zindex override the default.
const CLIPPED_DECORATION_ZINDEX = 10;

/**
 * Legends are rendered as guide regions, not grid children. Their thickness is
 * handled as overhang, but their parallel min/max constraints still affect the
 * grid dimension that the parent concat sees.
 *
 * @param {import("./gridChildLegends.js").GridChildLegends} legends
 * @returns {FlexDimensions}
 */
function getLegendParallelSizeConstraints(legends) {
    /** @type {import("../layout/flexLayout.js").SizeDef[]} */
    const widths = [];
    /** @type {import("../layout/flexLayout.js").SizeDef[]} */
    const heights = [];

    for (const [orient, region] of Object.entries(legends)) {
        if (!isActiveLegendRegion(region)) {
            continue;
        }

        const size = region.legendView.getSize();
        if (orient == "top" || orient == "bottom") {
            widths.push(size.width);
        } else {
            // Side gradients can fill the available viewport height, but that
            // available height must be determined by the real grid children and
            // top/bottom chrome. Otherwise a shared right/left legend can make
            // the grid grow to the browser height and then fill that height.
            heights.push({ px: getSizeDefMinPx(size.height), grow: 0 });
        }
    }

    return new FlexDimensions(getLargestSize(widths), getLargestSize(heights));
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
 * @template {import("../../spec/view.js").AnyConcatSpec} [TSpec=import("../../spec/view.js").AnyConcatSpec]
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

    #childSerial = 0;

    /** @type {Partial<Record<"horizontal" | "vertical", SeparatorView>>} */
    #separatorViews = {};

    /** @type {KeyboardZoomController | null} */
    #keyboardZoomController = null;

    /** @type {{ overlay: import("./generatedChromeOverlay.js").GeneratedChromeOverlay, order: number }[]} */
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

        this.#children = [];

        this.wrappingFacet = false;

        const separatorProps = resolveSeparatorProps(spec.separator);
        if (separatorProps) {
            for (const direction of getSeparatorDirections(spec)) {
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

    get #visibleChildren() {
        return this.#children.filter((gridChild) =>
            gridChild.view.isConfiguredVisible()
        );
    }

    get #grid() {
        return new Grid(
            this.#visibleChildren.length,
            this.#columns ?? Infinity
        );
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
     * Recreates guide and chrome views that depend on the child hierarchy.
     * Shared guides always depend on the whole container. Grid-child guides can
     * be limited to newly inserted children during mutations.
     *
     * @param {{ gridChildren?: GridChild[] }} [options]
     */
    async syncGuideViews(options = {}) {
        const gridChildren = options.gridChildren ?? this.#children;

        await Promise.all([
            this.#syncSharedAxes(),
            this.#syncSharedLegends(),
            this.#syncContainerOverlays(),
        ]);
        await Promise.all(
            gridChildren.map((gridChild) => gridChild.syncGuideViews())
        );
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
     */
    async #syncSharedLegends() {
        disposeLegendViews(this.#sharedLegends);
        this.#sharedLegends = {};

        for (const { definition, resolution } of getOrderedLegendEntries([
            this,
        ])) {
            const legend = await createGridChildLegend(definition, this);
            await addLegendView(this.#sharedLegends, legend, resolution);
        }
    }

    async #syncContainerOverlays() {
        for (const { overlay } of this.#containerOverlays) {
            overlay.view.disposeSubtree();
        }
        this.#containerOverlays = [];

        /** @type {Promise<void>[]} */
        const promises = [];

        for (const [paramName, param] of this.paramRuntime.paramConfigs) {
            if (!("select" in param)) {
                continue;
            }

            const select = asSelectionConfig(param.select);
            if (!isIntervalSelectionConfig(select)) {
                continue;
            }

            const channels = select.encodings ?? ["x"];
            const channel = channels.length === 1 ? channels[0] : undefined;
            if (
                !channel ||
                resolveOverlayExtent({
                    extent: select.extent,
                    ownerSpec: this.spec,
                    channels,
                    isAligned: (channel) =>
                        this.#hasAlignedOverlayProjection(channel),
                    label: `Interval selection param "${paramName}"`,
                }) !== "container"
            ) {
                continue;
            }

            const selectionExpr = this.paramRuntime.createExpression(paramName);
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
            });
            promises.push(overlay.view.initializeChildren());
        }

        for (const [paramName, param] of this.paramRuntime.paramConfigs) {
            if (!isRulerParameter(param)) {
                continue;
            }

            if (param.ruler.display === "none") {
                continue;
            }

            const channels = param.ruler.encodings ?? ["x"];
            const channel = channels.length === 1 ? channels[0] : undefined;
            if (
                !channel ||
                resolveOverlayExtent({
                    extent: param.ruler.extent,
                    ownerSpec: this.spec,
                    channels,
                    isAligned: (channel) =>
                        this.#hasAlignedOverlayProjection(channel),
                    label: `Ruler param "${paramName}"`,
                }) !== "container"
            ) {
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
            });
            this.#containerOverlays.push({
                overlay,
                order: DECORATION_ORDER.ruler,
            });
            promises.push(overlay.view.initializeChildren());
        }

        await Promise.all(promises);
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

        for (const separatorView of Object.values(this.#separatorViews)) {
            yield separatorView.view;
        }

        for (const axisView of Object.values(this.#sharedAxes)) {
            yield axisView;
        }

        yield* iterateLegendViews(this.#sharedLegends);
    }

    /**
     * @param {Direction} direction
     */
    #getSizes(direction) {
        const dim = direction == "column" ? "width" : "height";

        /**
         * @type {(indices: number[], side: 0 | 1) => number}
         */
        const getMaxAxisSize = (indices, side) =>
            indices
                .map((index) => {
                    const child = this.#visibleChildren[index];
                    const overhang = child.getOverhangAndPadding();

                    return direction == "column"
                        ? side
                            ? overhang.right
                            : overhang.left
                        : side
                          ? overhang.bottom
                          : overhang.top;
                })
                .reduce((a, b) => Math.max(a, b), 0);

        /**
         * @param {GridChild} child
         * @returns {import("../layout/flexLayout.js").SizeDef}
         */
        const getPlotSize = (child) => {
            // External overhang is represented by axis/padding slots. The
            // growable view slot should contain only the child's plot area.
            const size = child.view.getViewportSize()[dim];
            const overhang = child.view.getOverhang();
            const overhangSize =
                direction == "column" ? overhang.width : overhang.height;

            const plotSize = {
                px: Math.max((size.px ?? 0) - overhangSize, 0),
                grow: size.grow,
                minPx:
                    size.minPx === undefined
                        ? undefined
                        : Math.max(size.minPx - overhangSize, 0),
                maxPx:
                    size.maxPx === undefined
                        ? undefined
                        : Math.max(size.maxPx - overhangSize, 0),
            };

            const legendSize = getLegendParallelSizeConstraints(child.legends);
            // Side legends constrain row height, while top/bottom legends
            // constrain column width. Their perpendicular size is overhang.
            return getLargestSize([
                plotSize,
                direction == "column" ? legendSize.width : legendSize.height,
            ]);
        };

        return this._cache(`size/directionSizes/${direction}`, () =>
            this.#grid[direction == "column" ? "colIndices" : "rowIndices"].map(
                (col) => ({
                    axisBefore: getMaxAxisSize(col, 0),
                    axisAfter: getMaxAxisSize(col, 1),
                    view: getLargestSize(
                        col.map((rowIndex) =>
                            getPlotSize(this.#visibleChildren[rowIndex])
                        )
                    ),
                })
            )
        );
    }

    /**
     * An example layout with two children, either column or row-based direction:
     *
     * 0. title
     * 1. header
     * 2. axis/padding
     * 3. view
     * 4. axis/padding
     * 5. footer (if column and wrapping)
     * 5. spacing
     * 6. header (if column and wrapping)
     * 7. axis/padding
     * 8. view
     * 9. axis/padding
     * 10. footer
     *
     * @param {Direction} direction
     */
    #makeFlexItems(direction) {
        const sizes = this.#getSizes(direction);

        /** @type {import("../layout/flexLayout.js").SizeDef[]} */
        const items = [];

        // Title
        items.push(ZERO_SIZEDEF);

        for (const [i, size] of sizes.entries()) {
            if (i > 0) {
                // Spacing
                items.push({ px: this.#spacing, grow: 0 });
            }

            if (i == 0 || this.wrappingFacet) {
                // Header
                items.push(ZERO_SIZEDEF);
            }

            // Axis/padding
            items.push({ px: size.axisBefore, grow: 0 });

            // View
            items.push(size.view);

            // Axis/padding
            items.push({ px: size.axisAfter, grow: 0 });

            if (i == sizes.length - 1 || this.wrappingFacet) {
                //Footer
                items.push(ZERO_SIZEDEF);
            }
        }

        return items;
    }

    /**
     * @param {Direction} direction
     * @return {import("../layout/flexLayout.js").SizeDef}
     */
    #getFlexSize(direction) {
        let grow = 0;
        let px = 0;
        let minPx = 0;
        let maxPx = 0;
        let hasMaxPx = true;

        const explicitSize =
            direction == "row" ? this.spec.height : this.spec.width;
        const preferredSize =
            explicitSize || explicitSize === 0
                ? parseSizeDef(explicitSize)
                : undefined;
        const usePreferredAsViewSlot =
            preferredSize &&
            (direction == "column"
                ? this.#grid.colIndices.length == 1
                : this.#grid.rowIndices.length == 1);

        const sizes = this.#getSizes(direction);

        for (const [i, size] of sizes.entries()) {
            if (i > 0) {
                // Spacing
                px += this.#spacing;
                minPx += this.#spacing;
                maxPx += this.#spacing;
            }

            if (i == 0 || this.wrappingFacet) {
                // Header
                px += 0;
            }

            // Axis/padding
            px += size.axisBefore;
            minPx += size.axisBefore;
            maxPx += size.axisBefore;

            // View
            const viewSize = usePreferredAsViewSlot
                ? combinePreferredAndContentSize(preferredSize, size.view)
                : size.view;
            px += viewSize.px ?? 0;
            grow += viewSize.grow ?? 0;
            minPx += getSizeDefMinPx(viewSize);

            const viewMaxPx = getSizeDefMaxPx(viewSize);
            if (viewMaxPx === undefined) {
                hasMaxPx = false;
            } else {
                maxPx += viewMaxPx;
            }

            // Axis/padding
            px += size.axisAfter;
            minPx += size.axisAfter;
            maxPx += size.axisAfter;

            if (i == sizes.length - 1 || this.wrappingFacet) {
                //Footer
                px += 0;
            }
        }

        const measuredSize = {
            px,
            grow,
            minPx: minPx || undefined,
            maxPx: sizes.length && hasMaxPx ? maxPx : undefined,
        };

        return preferredSize && !usePreferredAsViewSlot
            ? combinePreferredAndContentSize(preferredSize, measuredSize)
            : measuredSize;
    }

    /**
     * Locates a view slot in FlexLayout
     *
     * @param {Direction} direction
     * @param {number} index column/row number
     */
    #getViewSlot(direction, index) {
        return direction == "row" && this.wrappingFacet
            ? // Views have header/footer on every row
              1 + 6 * index + 2
            : // Only first row has header, last row has footer.
              2 + 4 * index + 1;
    }

    /**
     * @return {Padding}
     */
    getOverhang() {
        return this.#getGridOverhang().add(this.#getSharedGuideOverhang());
    }

    #getGridOverhang() {
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

    #getSharedAxisOverhang() {
        /**
         * @param {import("../../spec/axis.js").AxisOrient} orient
         */
        const getSharedAxisSize = (orient) => {
            const channel = ORIENT_CHANNELS[orient];
            const axisView = this.#sharedAxes[channel];
            if (axisView?.axisProps.orient !== orient) {
                return 0;
            }

            return getExternalAxisOverhang(axisView);
        };

        return new Padding(
            getSharedAxisSize("top"),
            getSharedAxisSize("right"),
            getSharedAxisSize("bottom"),
            getSharedAxisSize("left")
        );
    }

    #getSharedLegendOverhang() {
        const getSharedLegendSize = (
            /** @type {import("../../spec/legend.js").LegendOrient} */ orient
        ) => getLegendOverhang(this.#sharedLegends, orient);

        return new Padding(
            getSharedLegendSize("top"),
            getSharedLegendSize("right"),
            getSharedLegendSize("bottom"),
            getSharedLegendSize("left")
        );
    }

    #getSharedGuideOverhang() {
        return this.#getSharedAxisOverhang().add(
            this.#getSharedLegendOverhang()
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
            const parallelLegendSize = getLegendParallelSizeConstraints(
                this.#sharedLegends
            );

            // Shared legends are placed around the whole grid, so combine their
            // parallel constraints with the child-grid size before adding
            // guide overhang.
            return new FlexDimensions(
                getLargestSize([
                    this.#getFlexSize("column"),
                    parallelLegendSize.width,
                ]),
                getLargestSize([
                    this.#getFlexSize("row"),
                    parallelLegendSize.height,
                ])
            ).addPadding(this.#getSharedGuideOverhang());
        });
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {import("../layout/rectangle.js").default} coords
     * @param {import("../../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        super.render(context, coords, options);

        if (!this.isConfiguredVisible()) {
            return;
        }

        if (!this.layoutParent) {
            // Usually padding is applied by the parent GridView, but if this is the root view, we need to apply it here
            coords = coords.shrink(this.getPadding());
        }
        const sharedGuideOverhang = this.#getSharedGuideOverhang();
        coords = coords.shrink(sharedGuideOverhang);

        context.pushView(this, coords);

        const devicePixelRatio = context.getDevicePixelRatio();

        const flexOpts = {
            devicePixelRatio,
        };
        let columnFlexCoords = mapToPixelCoords(
            this.#makeFlexItems("column"),
            coords.width,
            flexOpts
        );

        const rowFlexCoords = mapToPixelCoords(
            this.#makeFlexItems("row"),
            coords.height,
            flexOpts
        );

        const grid = new Grid(
            this.#visibleChildren.length,
            this.#columns ?? Infinity
        );

        let columnLayoutDirty = false;
        for (const [i, gridChild] of this.#visibleChildren.entries()) {
            const [col, row] = grid.getCellCoords(i);
            const colLocSize =
                columnFlexCoords[this.#getViewSlot("column", col)];
            const rowLocSize = rowFlexCoords[this.#getViewSlot("row", row)];

            // Some child views have side overhang that depends on the final
            // row height, such as SampleView's repeated y-axis threshold. Row
            // slots are known here, but final columns may need one more pass if
            // a child reports that its height-dependent overhang changed.
            const layoutChanged =
                /** @type {{ prepareLayoutSize?: (width: number, height: number) => boolean }} */ (
                    gridChild.view
                ).prepareLayoutSize?.(colLocSize.size, rowLocSize.size);
            columnLayoutDirty ||= layoutChanged === true;
        }

        if (columnLayoutDirty) {
            this._invalidateCacheByPrefix("size/directionSizes/column");
            columnFlexCoords = mapToPixelCoords(
                this.#makeFlexItems("column"),
                coords.width,
                flexOpts
            );
        }

        /** @param {number} x */
        const round = (x) =>
            Math.round(x * devicePixelRatio) / devicePixelRatio;

        // Compute layout once and then dispatch decorations around the content
        // render pass without recomputing per-child coordinates.
        const renderItems = [];

        for (const [i, gridChild] of this.#visibleChildren.entries()) {
            const {
                view,
                axes,
                gridLines,
                background,
                backgroundStroke,
                title,
                selectionRect,
                rulerOverlays,
            } = gridChild;

            const [col, row] = grid.getCellCoords(i);
            const colLocSize =
                columnFlexCoords[this.#getViewSlot("column", col)];
            const rowLocSize = rowFlexCoords[this.#getViewSlot("row", row)];

            const viewportSize = view.getViewportSize();
            const viewSize = view.getSize();

            const overhang = view.getOverhang();

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

            const getHScrollOffset = hScrollbar
                ? () => round(hScrollbar.viewportOffset)
                : () => 0;
            const getVScrollOffset = vScrollbar
                ? () => round(vScrollbar.viewportOffset)
                : () => 0;

            // TODO: Part of the following rendering logic could be moved to GridChild

            const viewportCoords = new Rectangle(
                () => coords.x + x,
                () => coords.y + y,
                () => viewportWidth,
                () => viewportHeight
            );

            const scrollable = view.isScrollable();

            const viewCoords = scrollable
                ? new Rectangle(
                      () => coords.x + x - getHScrollOffset(),
                      () => coords.y + y - getVScrollOffset(),
                      () => viewWidth,
                      () => viewHeight
                  )
                : viewportCoords;

            gridChild.coords = viewportCoords;

            const parentClip = normalizeClipOptions(options);
            const visibleChildCoords = clipCoords(viewportCoords, parentClip);

            renderItems.push({
                col,
                row,
                view,
                axes,
                gridLines,
                background,
                backgroundStroke,
                title,
                selectionRect,
                rulerOverlays,
                viewportCoords,
                viewCoords,
                parentClip,
                visibleChildCoords,
                viewWidth,
                viewHeight,
                scrollable,
                gridChild,
            });
        }

        const gridOverhang = this.#getGridOverhang();
        const gridViewCoords = getUnionCoords(
            renderItems.map((item) => item.viewCoords)
        );

        /** @type {{ zindex: number, order: number, sequence: number, render: () => void }[]} */
        const underlays = [];
        /** @type {{ zindex: number, order: number, sequence: number, render: () => void }[]} */
        const overlays = [];
        /** @type {(() => void)[]} */
        const contents = [];
        let sequence = 0;

        const queueDecoration = (
            /** @type {number} */ zindex,
            /** @type {number} */ order,
            /** @type {() => void} */ render
        ) => {
            const target = zindex > 0 ? overlays : underlays;
            target.push({
                zindex,
                order,
                sequence: sequence++,
                render,
            });
        };

        const renderDecorations = (
            /** @type {{ zindex: number, order: number, sequence: number, render: () => void }[]} */ items
        ) => {
            items.sort(
                (a, b) =>
                    a.zindex - b.zindex ||
                    a.order - b.order ||
                    a.sequence - b.sequence
            );

            for (const item of items) {
                item.render();
            }
        };

        for (const item of renderItems) {
            if (item.background) {
                queueDecoration(
                    item.gridChild.backgroundZindex,
                    DECORATION_ORDER.background,
                    () =>
                        item.background?.render(
                            context,
                            item.visibleChildCoords,
                            {
                                ...options,
                                clipRect: undefined,
                            }
                        )
                );
            }
        }

        const verticalSeparator = this.#separatorViews.vertical;
        if (verticalSeparator) {
            verticalSeparator.update(
                columnFlexCoords,
                grid.nCols,
                coords,
                (direction, index) => this.#getViewSlot(direction, index),
                this.wrappingFacet,
                gridOverhang
            );
            queueDecoration(
                verticalSeparator.getZindex(),
                DECORATION_ORDER.separator,
                () => verticalSeparator.render(context, coords, options)
            );
        }

        const horizontalSeparator = this.#separatorViews.horizontal;
        if (horizontalSeparator) {
            horizontalSeparator.update(
                rowFlexCoords,
                grid.nRows,
                coords,
                (direction, index) => this.#getViewSlot(direction, index),
                this.wrappingFacet,
                gridOverhang
            );
            queueDecoration(
                horizontalSeparator.getZindex(),
                DECORATION_ORDER.separator,
                () => horizontalSeparator.render(context, coords, options)
            );
        }

        if (gridViewCoords) {
            for (const { overlay, order } of this.#containerOverlays) {
                queueDecoration(overlay.zindex, order, () =>
                    overlay.view.render(context, gridViewCoords, options)
                );
            }
        }

        for (const item of renderItems) {
            const {
                view,
                axes,
                gridLines,
                backgroundStroke,
                title,
                selectionRect,
                rulerOverlays,
                viewportCoords,
                viewCoords,
                parentClip,
                visibleChildCoords,
                viewWidth,
                viewHeight,
                scrollable,
                gridChild,
                col,
                row,
            } = item;

            const clippedChildren = isClippedChildren(view);
            const clipped = clippedChildren || scrollable;
            const clippedDecorations = hasClippedChildren(view) || scrollable;

            for (const gridLineView of Object.values(gridLines)) {
                queueDecoration(
                    gridLineView.axisProps.zindex ?? 0,
                    DECORATION_ORDER.grid,
                    () => gridLineView.render(context, viewportCoords, options)
                );
            }

            const childClip = clipped
                ? combineClipOptions(
                      parentClip,
                      createClipOptions(
                          visibleChildCoords,
                          clippedChildren ||
                              Boolean(gridChild.scrollbars.horizontal),
                          clippedChildren ||
                              Boolean(gridChild.scrollbars.vertical)
                      )
                  )
                : options.clip;

            const renderContent = () =>
                view.render(
                    context,
                    viewCoords,
                    clipped
                        ? {
                              ...options,
                              clipRect: childClip?.rect,
                              clip: childClip,
                          }
                        : options
                );

            contents.push(renderContent);

            if (backgroundStroke) {
                queueDecoration(
                    defaultBackgroundStrokeZindex(
                        gridChild.backgroundStrokeZindex,
                        clippedDecorations
                    ),
                    DECORATION_ORDER.backgroundStroke,
                    () =>
                        backgroundStroke?.render(context, visibleChildCoords, {
                            ...options,
                            clipRect: undefined,
                        })
                );
            }

            // Independent axes
            for (const [orient, axisView] of Object.entries(axes)) {
                const direction =
                    orient == "left" || orient == "right"
                        ? "vertical"
                        : "horizontal";

                const scrollable = gridChild.scrollbars[direction];

                // Axes should stick to the viewport edge but move with the view
                // when scrolling.
                const coords = scrollable
                    ? viewportCoords.modify(
                          direction == "vertical"
                              ? {
                                    y: () => viewCoords.y,
                                    height: viewHeight,
                                }
                              : {
                                    x: () => viewCoords.x,
                                    width: viewWidth,
                                }
                      )
                    : viewportCoords;

                const translatedCoords = translateAxisCoords(
                    coords,
                    orient,
                    axisView
                );

                let clip = normalizeClipOptions(options);
                let clipRect = clip?.rect;

                // Scrollable axes must be clipped along the scroll direction.
                if (scrollable) {
                    const axisClip = createClipOptions(
                        viewportCoords,
                        direction == "horizontal",
                        direction == "vertical"
                    );
                    clip = combineClipOptions(clip, axisClip);
                    clipRect = clip?.rect;
                }

                if (clip && axisView.labelClipPolicy === "anchor") {
                    clip = createClipOptions(
                        clip.rect,
                        ORIENT_CHANNELS[orient] === "x",
                        ORIENT_CHANNELS[orient] === "y"
                    );
                    clipRect = clip?.rect;
                }

                queueDecoration(
                    defaultAxisZindex(axisView.axisProps, clippedDecorations),
                    DECORATION_ORDER.axis,
                    () =>
                        axisView.render(context, translatedCoords, {
                            ...options,
                            clipRect,
                            clip,
                        })
                );
            }

            renderLocalLegends(
                gridChild.legends,
                this.#getLegendOffsetAxes(axes, col, row, grid),
                viewportCoords,
                context,
                options,
                queueDecoration,
                DECORATION_ORDER.legend
            );

            // Axes shared between children
            // TODO: What if some have scrollable viewports?
            // Should throw an error because cannot have shared axes in such cases.
            for (const axisView of Object.values(this.#sharedAxes)) {
                const props = axisView.axisProps;
                const orient = props.orient;
                if (
                    (orient == "left" && col == 0) ||
                    (orient == "right" && col == grid.nCols - 1) ||
                    (orient == "top" && row == 0) ||
                    (orient == "bottom" && row == grid.nRows - 1)
                ) {
                    queueDecoration(
                        defaultAxisZindex(
                            axisView.axisProps,
                            clippedDecorations
                        ),
                        DECORATION_ORDER.axis,
                        () =>
                            axisView.render(
                                context,
                                translateAxisCoords(
                                    viewportCoords.shrink(
                                        gridChild.view.getOverhang()
                                    ),
                                    orient,
                                    axisView
                                ),
                                options
                            )
                    );
                }
            }

            if (selectionRect) {
                queueDecoration(
                    selectionRect.zindex,
                    DECORATION_ORDER.selectionRect,
                    () =>
                        selectionRect.view.render(context, viewCoords, options)
                );
            }

            for (const overlay of rulerOverlays) {
                queueDecoration(overlay.zindex, DECORATION_ORDER.ruler, () =>
                    overlay.view.render(context, viewCoords, options)
                );
            }

            for (const scrollbar of Object.values(gridChild.scrollbars)) {
                queueDecoration(1, DECORATION_ORDER.scrollbar, () => {
                    scrollbar.updateScrollbar(viewportCoords, viewCoords);
                    scrollbar.render(context, coords, options);
                });
            }

            if (title) {
                queueDecoration(
                    gridChild.getTitleZindex(),
                    DECORATION_ORDER.title,
                    () =>
                        gridChild.renderTitle(context, viewportCoords, options)
                );
            }
        }

        renderLocalLegends(
            this.#sharedLegends,
            this.#getSharedAxesByOrient(),
            coords,
            context,
            options,
            queueDecoration,
            DECORATION_ORDER.legend
        );

        renderDecorations(underlays);

        for (const renderContent of contents) {
            renderContent();
        }

        renderDecorations(overlays);

        context.popView(this);
    }

    /**
     * Local legends are GridChild-owned, but shared axes are GridView-owned.
     * When they share an orient, the axis should remain next to the plot and
     * the legend should move outside it. Give legend placement the applicable
     * shared edge axes so `renderLocalLegends()` can apply the same offset it
     * already uses for local axes.
     *
     * @param {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisView>>} axes
     * @param {number} col
     * @param {number} row
     * @param {Grid} grid
     */
    #getLegendOffsetAxes(axes, col, row, grid) {
        /** @type {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisView>>} */
        const offsetAxes = { ...axes };

        for (const axisView of Object.values(this.#sharedAxes)) {
            const orient = axisView.axisProps.orient;
            const isEdge =
                (orient == "left" && col == 0) ||
                (orient == "right" && col == grid.nCols - 1) ||
                (orient == "top" && row == 0) ||
                (orient == "bottom" && row == grid.nRows - 1);

            if (isEdge && !offsetAxes[orient]) {
                offsetAxes[orient] = axisView;
            }
        }

        return offsetAxes;
    }

    /**
     * @param {import("../../utils/interaction.js").default} event
     */
    propagateInteraction(event) {
        propagateInteraction(this, event, () => {
            const pointedChild = this.#visibleChildren.find((gridChild) =>
                gridChild.coords.containsPoint(event.point.x, event.point.y)
            );
            const pointedView = pointedChild?.view;
            const gapZoomTarget = !pointedChild
                ? this.#getGapZoomTarget(event.point)
                : undefined;

            if (event.type === "wheelclaimprobe") {
                // Probe path: claim wheel ownership without executing regular wheel
                // behavior. InteractionController uses this to decide whether native
                // wheel should be preventDefault()'ed before inertia kicks in.
                if (!pointedView) {
                    if (gapZoomTarget) {
                        event.claimWheel();
                    }
                    return;
                }

                if (isZoomInteractionView(pointedView)) {
                    if (hasZoomableResolutions(pointedView)) {
                        event.claimWheel();
                    }
                } else {
                    pointedView.propagateInteraction(event);
                }
                return;
            }

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

            if (!pointedView) {
                if (gapZoomTarget) {
                    this.#propagateGapZoomInteraction(event, gapZoomTarget);
                }
                return;
            }

            propagateInteractionSurface(
                event,
                () => true,
                () => pointedView.propagateInteraction(event),
                isZoomInteractionView(pointedView)
                    ? () =>
                          interactionToZoom(
                              event,
                              pointedChild.coords,
                              (zoomEvent) =>
                                  this.#handleZoom(
                                      pointedChild.coords,
                                      pointedChild.view,
                                      zoomEvent
                                  ),
                              this.context.getCurrentHover(),
                              this.context.animator
                          )
                    : undefined
            );
        });
    }

    /**
     * @param {import("../layout/point.js").default} point
     * @returns {{ coords: Rectangle, zoomableResolutions: ReturnType<typeof getZoomableResolutionSet> } | undefined}
     */
    #getGapZoomTarget(point) {
        const channel = this.#getGapZoomChannel();
        if (!channel) {
            return;
        }

        const resolution = this.getScaleResolution(channel);
        if (!resolution || !resolution.isZoomable()) {
            return;
        }

        const coords = this.#getGapZoomCoords(channel);
        if (!coords) {
            return;
        }

        if (!coords.containsPoint(point.x, point.y)) {
            return;
        }

        return {
            coords,
            zoomableResolutions: getZoomableResolutionSet(channel, resolution),
        };
    }

    /**
     * @returns {import("../../spec/channel.js").PrimaryPositionalChannel | undefined}
     */
    #getGapZoomChannel() {
        if (isVConcatSpec(this.spec)) {
            return "x";
        } else if (isHConcatSpec(this.spec)) {
            return "y";
        }
    }

    /**
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
     * @returns {Rectangle | undefined}
     */
    #getGapZoomCoords(channel) {
        const firstChild = this.#visibleChildren[0];
        if (!firstChild) {
            return;
        }

        const firstViewportCoords = firstChild.coords;
        const firstExpandedCoords = firstChild.coords.expand(
            firstChild.getOverhang()
        );

        let minX = firstViewportCoords.x;
        let minY = firstExpandedCoords.y;
        let maxX = firstViewportCoords.x2;
        let maxY = firstExpandedCoords.y2;

        for (const gridChild of this.#visibleChildren.slice(1)) {
            const viewportCoords = gridChild.coords;
            const expandedCoords = gridChild.coords.expand(
                gridChild.getOverhang()
            );

            if (channel == "x") {
                minX = Math.max(minX, viewportCoords.x);
                maxX = Math.min(maxX, viewportCoords.x2);
                minY = Math.min(minY, expandedCoords.y);
                maxY = Math.max(maxY, expandedCoords.y2);
            } else {
                minX = Math.min(minX, expandedCoords.x);
                maxX = Math.max(maxX, expandedCoords.x2);
                minY = Math.max(minY, viewportCoords.y);
                maxY = Math.min(maxY, viewportCoords.y2);
            }
        }

        for (const axisView of Object.values(this.#sharedAxes)) {
            const axisCoords = axisView.coords;
            if (!axisCoords) {
                continue;
            }

            const orient = axisView.axisProps.orient;
            if (channel == "x" && (orient == "top" || orient == "bottom")) {
                minY = Math.min(minY, axisCoords.y);
                maxY = Math.max(maxY, axisCoords.y2);
            } else if (
                channel == "y" &&
                (orient == "left" || orient == "right")
            ) {
                minX = Math.min(minX, axisCoords.x);
                maxX = Math.max(maxX, axisCoords.x2);
            }
        }

        if (minX >= maxX || minY >= maxY) {
            return;
        }

        return Rectangle.create(minX, minY, maxX - minX, maxY - minY);
    }

    /**
     * @param {import("../../utils/interaction.js").default} event
     * @param {{ coords: Rectangle, zoomableResolutions: ReturnType<typeof getZoomableResolutionSet> }} gapZoomTarget
     */
    #propagateGapZoomInteraction(event, gapZoomTarget) {
        event.target = this;

        interactionToZoom(
            event,
            gapZoomTarget.coords,
            (zoomEvent) =>
                zoomResolutions(
                    gapZoomTarget.coords,
                    zoomEvent,
                    gapZoomTarget.zoomableResolutions,
                    this.context.animator
                ),
            this.context.getCurrentHover(),
            this.context.animator
        );
    }

    /**
     *
     * @param {import("../layout/rectangle.js").default} coords Coordinates
     * @param {View} view
     * @param {import("../zoom.js").ZoomEvent} zoomEvent
     * @returns {boolean} `true` when there was at least one zoomable resolution
     */
    #handleZoom(coords, view, zoomEvent) {
        return zoomResolutions(
            coords,
            zoomEvent,
            getZoomableResolutions(view),
            this.context.animator
        );
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
 * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
 * @param {import("../../scales/scaleResolution.js").default} resolution
 */
function getZoomableResolutionSet(channel, resolution) {
    const zoomableResolutions = {
        x: new Set(),
        y: new Set(),
    };
    zoomableResolutions[channel].add(resolution);
    return zoomableResolutions;
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
                channel == "x" ? delta.x : -delta.y
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
 * @param {View} view
 */
export function isClippedChildren(view) {
    let clipped = true;

    view.visit((v) => {
        if (v instanceof UnitView) {
            clipped &&= v.mark.properties.clip === true;
        }
    });

    return clipped;
}

/**
 * @param {View} view
 */
function hasClippedChildren(view) {
    let clipped = false;

    view.visit((v) => {
        if (v instanceof UnitView) {
            const clip = v.mark.properties.clip;
            clipped ||= clip === true || clip === "x" || clip === "y";
        }
    });

    return clipped;
}

/**
 * @param {View} view
 * @returns {boolean}
 */
function hasZoomableResolutions(view) {
    const zoomableResolutions = getZoomableResolutions(view);
    return zoomableResolutions.x.size > 0 || zoomableResolutions.y.size > 0;
}

/**
 * @param {View} view
 * @returns {view is UnitView | LayerView}
 */
function isZoomInteractionView(view) {
    return view instanceof UnitView || view instanceof LayerView;
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
 * @param {Rectangle[]} coords
 * @returns {Rectangle | undefined}
 */
function getUnionCoords(coords) {
    if (coords.length === 0) {
        return undefined;
    }

    const x = Math.min(...coords.map((coord) => coord.x));
    const y = Math.min(...coords.map((coord) => coord.y));
    const x2 = Math.max(...coords.map((coord) => coord.x2));
    const y2 = Math.max(...coords.map((coord) => coord.y2));

    return Rectangle.create(x, y, x2 - x, y2 - y);
}

/**
 * Default z-index for axes. Inside axes default to overlays because they share
 * plot space with marks. Clipped or scrollable outside axes get a higher
 * default to keep guides above visible edge artifacts.
 *
 * @param {import("../../spec/axis.js").Axis} axisProps
 * @param {boolean} clipped
 * @returns {number}
 */
function defaultAxisZindex(axisProps, clipped) {
    if (axisProps.zindex !== undefined) {
        return axisProps.zindex;
    } else if (axisProps.placement === "inside") {
        return 1;
    } else if (clipped) {
        return CLIPPED_DECORATION_ZINDEX;
    } else {
        return 0;
    }
}

/**
 * Default z-index for view strokes. Clipped or scrollable content gets a
 * higher default to keep the stroke above visible edge artifacts.
 *
 * @param {number | undefined} zindex
 * @param {boolean} clipped
 * @returns {number}
 */
function defaultBackgroundStrokeZindex(zindex, clipped) {
    return zindex ?? (clipped ? CLIPPED_DECORATION_ZINDEX : 0);
}

/**
 *
 * @param {import("../layout/rectangle.js").default} coords
 * @param {import("../../spec/axis.js").AxisOrient} orient
 * @param {AxisView} axisView
 */
export function translateAxisCoords(coords, orient, axisView) {
    const props = axisView.axisProps;
    const ps = axisView.getPerpendicularSize();
    const inside = props.placement === "inside";
    const offset = props.offset ?? 0;

    if (orient == "bottom") {
        return inside
            ? coords.translate(0, coords.height - ps - offset).modify({
                  height: ps,
              })
            : coords.translate(0, coords.height + offset).modify({
                  height: ps,
              });
    } else if (orient == "top") {
        return inside
            ? coords.translate(0, offset).modify({ height: ps })
            : coords.translate(0, -ps - offset).modify({ height: ps });
    } else if (orient == "left") {
        return inside
            ? coords.translate(offset, 0).modify({ width: ps })
            : coords.translate(-ps - offset, 0).modify({ width: ps });
    } else if (orient == "right") {
        return inside
            ? coords.translate(coords.width - ps - offset, 0).modify({
                  width: ps,
              })
            : coords.translate(coords.width + offset, 0).modify({ width: ps });
    }
}
