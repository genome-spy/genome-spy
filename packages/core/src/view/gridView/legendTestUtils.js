import ConcatView from "../concatView.js";
import AxisView from "../axisView.js";
import LegendView, { LegendRegionView } from "../legendView.js";
import UnitView from "../unitView.js";
import ViewRenderingContext from "../renderingContext/viewRenderingContext.js";
import { createAndInitialize } from "../testUtils.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../../data/flowInit.js";

// Minimal context for layout-driven render calls without WebGL.
export class NoOpRenderingContext extends ViewRenderingContext {
    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} options
     */
    constructor(options) {
        super(options);
    }

    /**
     * @param {import("../view.js").default} _view
     * @param {import("../layout/rectangle.js").default} _coords
     */
    pushView(_view, _coords) {
        //
    }

    popView() {
        //
    }

    /**
     * @param {import("../../marks/mark.js").default} _mark
     */
    renderMark(_mark) {
        //
    }
}

export class MarkRecordingRenderingContext extends NoOpRenderingContext {
    /** @type {string[]} */
    markNames = [];

    /**
     * @param {import("../../marks/mark.js").default} mark
     */
    renderMark(mark) {
        this.markNames.push(mark.unitView.name);
    }
}

export class LegendRecordingRenderingContext extends NoOpRenderingContext {
    /** @type {Map<LegendView, import("../layout/rectangle.js").default>} */
    legendCoords = new Map();

    /**
     * @param {import("../view.js").default} view
     * @param {import("../layout/rectangle.js").default} coords
     */
    pushView(view, coords) {
        if (view instanceof LegendView) {
            this.legendCoords.set(view, coords);
        }
    }
}

export class GuideRecordingRenderingContext extends LegendRecordingRenderingContext {
    /** @type {{ axis: AxisView, coords: import("../layout/rectangle.js").default }[]} */
    axes = [];

    /**
     * @param {import("../view.js").default} view
     * @param {import("../layout/rectangle.js").default} coords
     */
    pushView(view, coords) {
        super.pushView(view, coords);
        if (view instanceof AxisView) {
            this.axes.push({ axis: view, coords });
        }
    }
}

export const createLegendTestView = (
    /** @type {Partial<import("../../spec/root.js").RootSpec>} */ spec = {}
) =>
    createAndInitialize(
        /** @type {import("../../spec/root.js").RootSpec} */ ({
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, Origin: "Europe" },
                            { x: 2, y: 3, Origin: "Japan" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: { field: "Origin", type: "nominal" },
                    },
                },
            ],
            ...spec,
        }),
        ConcatView
    );

/**
 * Uses an explicit context so tests can model configured view visibility.
 *
 * @param {Partial<import("../../spec/root.js").RootSpec>} spec
 * @param {import("../../types/viewContext.js").default} context
 * @returns {Promise<ConcatView>}
 */
export async function createLegendTestViewWithContext(spec, context) {
    const view = await context.createOrImportView(
        /** @type {import("../../spec/root.js").RootSpec} */ (spec),
        null,
        null,
        "viewRoot"
    );
    if (!(view instanceof ConcatView)) {
        throw new Error("Expected a concat root view!");
    }

    view.visit((descendant) => {
        if (descendant instanceof UnitView) {
            descendant.mark.initializeEncoders();
        }
    });

    const { dataSources } = initializeViewSubtree(view, context.dataFlow);
    await loadViewSubtreeData(view, dataSources);

    return view;
}

export const getLegends = (/** @type {ConcatView} */ view) =>
    view
        .getDescendants()
        .filter((descendant) => descendant instanceof LegendView);

export const getLegendRegions = (/** @type {ConcatView} */ view) =>
    view
        .getDescendants()
        .filter((descendant) => descendant instanceof LegendRegionView);

export const getLegendTitle = (/** @type {LegendView} */ legend) =>
    legend.getDescendants().find((descendant) => descendant.name == "title");

/**
 * @param {LegendView} legend
 * @param {string} name
 */
export function getLegendChild(legend, name) {
    const child = legend
        .getDescendants()
        .find((descendant) => descendant.name == name);
    if (!child) {
        throw new Error(`Legend child "${name}" not found!`);
    }

    return child;
}

/**
 * @param {LegendView} legend
 * @param {string} name
 */
export function getLegendUnitChild(legend, name) {
    const child = getLegendChild(legend, name);
    if (!(child instanceof UnitView)) {
        throw new Error(`Legend child "${name}" is not a UnitView!`);
    }

    return child;
}

/** @param {UnitView} view */
export const getUnitData = (view) =>
    Array.from(view.flowHandle.collector.getData());

/**
 * @param {LegendView} legend
 * @param {string} name
 */
export const getLegendData = (legend, name) =>
    getUnitData(getLegendUnitChild(legend, name));

export const getLegendTitles = (/** @type {ConcatView} */ view) =>
    getLegends(view).map((legend) => legend.legendProps.title);

/**
 * @param {number} [height]
 * @returns {import("../../spec/view.js").UnitSpec}
 */
export function createIndexColorPlotSpec(height) {
    return {
        ...(height === undefined ? {} : { height }),
        data: {
            values: [
                { x: 1, y: 2, Origin: "Europe" },
                { x: 2, y: 3, Origin: "Japan" },
            ],
        },
        mark: "point",
        encoding: {
            x: { field: "x", type: "index" },
            y: { field: "y", type: "quantitative" },
            color: { field: "Origin", type: "nominal" },
        },
    };
}
