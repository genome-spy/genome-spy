import {
    asSelectionConfig,
    isIntervalSelectionConfig,
} from "../../selection/selection.js";
import AxisGridView from "../axisGridView.js";
import AxisView, { CHANNEL_ORIENTS } from "../axisView.js";
import LayerView from "../layerView.js";
import Padding from "../layout/padding.js";
import Rectangle from "../layout/rectangle.js";
import createTitle from "../title.js";
import UnitView from "../unitView.js";
import Scrollbar from "./scrollbar.js";
import SelectionRect from "./selectionRect.js";

export default class GridChild {
    /**
     * @param {import("../view.js").default} view
     * @param {import("../containerView.js").default} layoutParent
     * @param {number} serial
     */
    constructor(view, layoutParent, serial) {
        this.layoutParent = layoutParent;
        this.view = view;
        this.serial = serial;

        /** @type {UnitView} */
        this.background = undefined;

        /** @type {UnitView} */
        this.backgroundStroke = undefined;

        /** @type {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisView>>} axes */
        this.axes = {};

        /** @type {Partial<Record<import("../../spec/axis.js").AxisOrient, AxisGridView>>} gridLines */
        this.gridLines = {};

        /** @type {Partial<Record<import("./scrollbar.js").ScrollDirection, Scrollbar>>} */
        this.scrollbars = {};

        /** @type {SelectionRect} */
        this.selectionRect = undefined;

        /** @type {UnitView} */
        this.title = undefined;

        /** @type {Rectangle} */
        this.coords = Rectangle.ZERO;

        if (view.needsAxes.x || view.needsAxes.y) {
            const spec = view.spec;
            const viewBackground = "view" in spec ? spec?.view : undefined;

            const backgroundSpec = createBackground(viewBackground);
            if (backgroundSpec) {
                this.background = new UnitView(
                    backgroundSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "background" + serial,
                    {
                        blockEncodingInheritance: true,
                    }
                );
            }

            const backgroundStrokeSpec = createBackgroundStroke(viewBackground);
            if (backgroundStrokeSpec) {
                this.backgroundStroke = new UnitView(
                    backgroundStrokeSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "backgroundStroke" + serial,
                    {
                        blockEncodingInheritance: true,
                    }
                );
            }

            const title = createTitle(view.spec.title);
            if (title) {
                const unitView = new UnitView(
                    title,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "title" + serial,
                    {
                        blockEncodingInheritance: true,
                    }
                );
                this.title = unitView;
            }
        }

        // TODO: More specific getter for this
        if (view.spec.viewportWidth != null) {
            this.scrollbars.horizontal = new Scrollbar(this, "horizontal");
        }

        if (view.spec.viewportHeight != null) {
            this.scrollbars.vertical = new Scrollbar(this, "vertical");
        }

        this.#setupIntervalSelection();
    }

    #setupIntervalSelection() {
        const view = this.view;

        for (const [, param] of view.paramMediator.paramConfigs) {
            if (!("select" in param)) {
                continue;
            }

            const select = asSelectionConfig(param.select);

            if (isIntervalSelectionConfig(select)) {
                this.selectionRect = new SelectionRect(this, select.encodings);

                const invertPoint = (
                    /** @type {import("../layout/point.js").default} */ point
                ) => {
                    const inverted = { x: 0, y: 0 };

                    const np = view.coords.normalizePoint(point.x, point.y);

                    for (const channel of select.encodings) {
                        const resolution =
                            this.view.getScaleResolution(channel);
                        inverted[channel] = resolution.scale.invert(
                            channel == "x" ? np.x : 1 - np.y
                        );
                    }

                    return inverted;
                };

                view.addInteractionEventListener(
                    "mousedown",
                    (coords, event) => {
                        const start = invertPoint(event.point);

                        /** @type {import("../view.js").InteractionEventListener} */
                        const mouseMoveListener = (coords, event) => {
                            const current = invertPoint(event.point);

                            // TODO: Should be updated when the selection param changes
                            this.selectionRect.update(
                                [start.x, current.x],
                                [start.y, current.y]
                            );
                        };

                        const mouseUpListener =
                            /** @type {function(MouseEvent)} */
                            (event) => {
                                this.selectionRect.clear();

                                view.removeInteractionEventListener(
                                    "mousemove",
                                    mouseMoveListener
                                );
                                window.removeEventListener(
                                    "mouseup",
                                    mouseUpListener
                                );
                            };
                        view.addInteractionEventListener(
                            "mousemove",
                            mouseMoveListener
                        );

                        window.addEventListener("mouseup", mouseUpListener);
                    }
                );
            }
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
        yield* Object.values(this.axes);
        yield* Object.values(this.gridLines);
        yield this.view;
        yield* Object.values(this.scrollbars);
        if (this.selectionRect) {
            yield this.selectionRect;
        }
    }

    /**
     * Create view decorations, grid lines, axes, etc.
     */
    async createAxes() {
        const { view, axes, gridLines } = this;

        /**
         * @param {import("../axisResolution.js").default} r
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
         * @param {import("../axisResolution.js").default} r
         * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
         * @param {import("../view.js").default} axisParent
         */
        const createAxis = async (r, channel, axisParent) => {
            const props = getAxisPropsWithDefaults(r, channel);

            if (props) {
                if (axes[props.orient]) {
                    throw new Error(
                        `An axis with the orient "${props.orient}" already exists!`
                    );
                }

                const axisView = new AxisView(
                    props,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent
                );
                axes[props.orient] = axisView;
                await axisView.initializeChildren();
            }
        };

        /**
         * @param {import("../axisResolution.js").default} r
         * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
         * @param {import("../view.js").default} axisParent
         */
        const createAxisGrid = async (r, channel, axisParent) => {
            const props = getAxisPropsWithDefaults(r, channel);

            if (props && (props.grid || props.chromGrid)) {
                const axisGridView = new AxisGridView(
                    props,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent
                );
                gridLines[props.orient] = axisGridView;
                await axisGridView.initializeChildren();
            }
        };

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

        // Axes are created after scales are resolved, so we need to resolve possible new scales here
        [...Object.values(axes), ...Object.values(gridLines)].forEach((v) =>
            v.visit((view) => {
                if (view instanceof UnitView) {
                    view.resolve("scale");
                }
            })
        );
    }

    getOverhang() {
        const calculate = (
            /** @type {import("../../spec/axis.js").AxisOrient} */ orient
        ) => {
            const axisView = this.axes[orient];
            return axisView
                ? Math.max(
                      axisView.getPerpendicularSize() +
                          (axisView.axisProps.offset ?? 0),
                      0
                  )
                : 0;
        };

        // Axes and overhang should be mutually exclusive, so we can just add them together
        return new Padding(
            calculate("top"),
            calculate("right"),
            calculate("bottom"),
            calculate("left")
        ).add(this.view.getOverhang());
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
    if (
        !viewBackground ||
        !viewBackground.fill ||
        viewBackground.fillOpacity === 0
    ) {
        return;
    }

    return {
        configurableVisibility: false,
        data: { values: [{}] },
        mark: {
            color: viewBackground.fill,
            opacity: viewBackground.fillOpacity ?? 1.0,
            type: "rect",
            clip: false, // Shouldn't be needed
            tooltip: null,
            minHeight: 1,
            minOpacity: 0,
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
        configurableVisibility: false,
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
            clip: false,
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
