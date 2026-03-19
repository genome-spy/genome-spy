import { describe, expect, test } from "vitest";

import Rectangle from "./layout/rectangle.js";
import ViewRenderingContext from "./renderingContext/viewRenderingContext.js";
import UnitView from "./unitView.js";
import AxisView from "./axisView.js";
import { createTestViewContext } from "./testUtils.js";
import { VIEW_ROOT_NAME } from "./viewFactory.js";
import { checkForDuplicateScaleNames } from "./viewUtils.js";
import { initializeViewData } from "../genomeSpy/viewDataInit.js";

class NoOpRenderingContext extends ViewRenderingContext {
    /**
     * @param {import("../types/rendering.js").GlobalRenderingOptions} options
     */
    constructor(options) {
        super(options);
    }

    pushView() {
        //
    }

    popView() {
        //
    }

    renderMark() {
        //
    }
}

/**
 * @param {import("./view.js").default} root
 * @param {import("../spec/axis.js").AxisOrient} orient
 */
function findAxisView(root, orient) {
    /** @type {AxisView | undefined} */
    let axisView;

    root.visit((view) => {
        if (view instanceof AxisView && view.axisProps.orient === orient) {
            axisView = view;
        }
    });

    if (!axisView) {
        throw new Error("Axis not found for orient " + orient);
    }

    return axisView;
}

/**
 * @param {AxisView} axisView
 */
function findLabelsView(axisView) {
    const labelsView = axisView
        .getDescendants()
        .find(
            (view) => view instanceof UnitView && view.name === "labels_main"
        );

    if (!(labelsView instanceof UnitView)) {
        throw new Error("Axis labels view not found!");
    }

    return labelsView;
}

/**
 * @typedef {import("../types/viewContext.js").default & {
 *   emitBroadcast: (
 *     root: import("./view.js").default,
 *     type: import("../genomeSpy.js").BroadcastEventType,
 *     payload?: any
 *   ) => void,
 * }} TestViewContext
 */

/**
 * @returns {TestViewContext}
 */
function createBroadcastingContext() {
    const context = /** @type {TestViewContext} */ (
        createTestViewContext({ wrapRoot: true })
    );

    /** @type {Map<string, Set<(message: any) => void>>} */
    const listeners = new Map();

    context.addBroadcastListener = (type, listener) => {
        const typedListeners = listeners.get(type) ?? new Set();
        typedListeners.add(listener);
        listeners.set(type, typedListeners);
    };

    context.removeBroadcastListener = (type, listener) => {
        listeners.get(type)?.delete(listener);
    };

    /**
     * @param {import("./view.js").default} root
     * @param {import("../genomeSpy.js").BroadcastEventType} type
     * @param {any} [payload]
     */
    context.emitBroadcast = (root, type, payload) => {
        const message = /** @type {import("./view.js").BroadcastMessage} */ ({
            type,
            payload,
        });
        root.visit((view) => view.handleBroadcast(message));
        for (const listener of listeners.get(type) ?? []) {
            listener(message);
        }
    };

    return context;
}

/**
 * @param {ReturnType<typeof createBroadcastingContext>} context
 * @param {import("./view.js").default} root
 * @param {import("../genomeSpy.js").BroadcastEventType} type
 * @param {any} [payload]
 */
function emitBroadcast(context, root, type, payload) {
    const message = /** @type {import("./view.js").BroadcastMessage} */ ({
        type,
        payload,
    });
    root.visit((view) => view.handleBroadcast(message));
}

/**
 * @param {import("../spec/root.js").RootSpec} spec
 * @param {ReturnType<typeof createBroadcastingContext>} context
 */
async function createAndInitializeRoot(spec, context) {
    const root = await context.createOrImportView(
        /** @type {import("../spec/view.js").ViewSpec} */ (spec),
        null,
        null,
        VIEW_ROOT_NAME
    );

    checkForDuplicateScaleNames(root);
    await initializeViewData(
        root,
        context.dataFlow,
        context.fontManager,
        () => undefined
    );

    return root;
}

/**
 * @param {import("./view.js").default} root
 * @param {ReturnType<typeof createBroadcastingContext>} context
 */
function reflow(root, context) {
    root.render(
        new NoOpRenderingContext({ picking: false }),
        Rectangle.create(0, 0, 320, 240),
        {
            firstFacet: true,
        }
    );
    emitBroadcast(context, root, "layoutComputed");
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

/**
 * @param {import("./view.js").default} root
 * @param {ReturnType<typeof createBroadcastingContext>} context
 */
async function settleLayout(root, context) {
    let needsReflow = true;
    context.requestLayoutReflow = () => {
        needsReflow = true;
    };

    let iterations = 0;
    while (needsReflow) {
        needsReflow = false;
        reflow(root, context);
        await flushMicrotasks();
        iterations += 1;
        if (iterations > 10) {
            throw new Error("Layout did not settle.");
        }
    }
}

/**
 * @param {import("../spec/root.js").RootSpec} spec
 * @param {import("../spec/axis.js").AxisOrient} orient
 */
async function getSettledAxisSnapshot(spec, orient) {
    const context = createBroadcastingContext();
    const root = await createAndInitializeRoot(spec, context);
    const axis = findAxisView(root, orient);

    await settleLayout(root, context);

    const labelsView = findLabelsView(axis);
    /** @type {{ value: any, label: any, width: any }[]} */
    const rows = [];
    labelsView.getCollector().visitData((datum) => {
        rows.push({
            value: datum.value,
            label: datum.label,
            width: datum._labelWidth,
        });
    });

    const channel = orient === "left" || orient === "right" ? "y" : "x";

    return {
        extent: axis.getPerpendicularSize(),
        heuristicExtent: getHeuristicExtent(axis),
        domain: axis.dataParent.getScaleResolution(channel).getDomain(),
        rows,
    };
}

/**
 * @param {AxisView} axis
 */
function getHeuristicExtent(axis) {
    const mainChannel =
        axis.axisProps.orient === "left" || axis.axisProps.orient === "right"
            ? "y"
            : "x";

    let extent = (axis.axisProps.ticks && axis.axisProps.tickSize) || 0;

    if (axis.axisProps.labels) {
        extent += axis.axisProps.labelPadding;
        extent += mainChannel === "x" ? axis.axisProps.labelFontSize : 30;
    }

    if (axis.axisProps.title) {
        extent += axis.axisProps.titlePadding + axis.axisProps.titleFontSize;
    }

    return Math.min(
        axis.axisProps.maxExtent || Infinity,
        Math.max(axis.axisProps.minExtent || 0, extent)
    );
}

describe("Axis extent measurement", () => {
    test("axis labels propagate font props to text mark and measureText", async () => {
        const context = createBroadcastingContext();
        const root = await createAndInitializeRoot(
            {
                data: {
                    values: [{ category: "Alpha", value: 1 }],
                },
                config: {
                    axisBottom: {
                        labelFont: "Lato",
                        labelFontStyle: "italic",
                        labelFontWeight: "bold",
                    },
                },
                mark: "rect",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    y2: { value: 0 },
                },
            },
            context
        );

        const axis = findAxisView(root, "bottom");
        const labelsView = findLabelsView(axis);
        const measureTextTransform =
            /** @type {import("../spec/transform.js").MeasureTextParams[]} */ (
                labelsView.spec.transform
            ).find((transform) => transform.type === "measureText");
        const textMark = /** @type {import("../marks/text.js").default} */ (
            labelsView.mark
        );

        expect(textMark.properties.font).toBe("Lato");
        expect(textMark.properties.fontStyle).toBe("italic");
        expect(textMark.properties.fontWeight).toBe("bold");

        expect(measureTextTransform).toMatchObject({
            type: "measureText",
            field: "label",
            as: "_labelWidth",
            font: "Lato",
            fontStyle: "italic",
            fontWeight: "bold",
            fontSize: axis.axisProps.labelFontSize,
        });
    });

    test("long categorical labels increase bottom axis extent after layout", async () => {
        const context = createBroadcastingContext();
        const root = await createAndInitializeRoot(
            {
                data: {
                    values: [
                        {
                            category:
                                "Very long category label for axis extent",
                            value: 1,
                        },
                        {
                            category: "Another very long category label",
                            value: 2,
                        },
                    ],
                },
                mark: "rect",
                encoding: {
                    x: { field: "category", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    y2: { value: 0 },
                },
            },
            context
        );

        const axis = findAxisView(root, "bottom");
        const heuristicExtent = getHeuristicExtent(axis);

        await settleLayout(root, context);

        expect(axis.getPerpendicularSize()).toBeGreaterThan(heuristicExtent);
    });

    test("zoom-driven extent updates keep the existing axis subtree alive", async () => {
        const context = createBroadcastingContext();
        const root = await createAndInitializeRoot(
            {
                data: {
                    values: [
                        { x: 0, y: 0 },
                        { x: 1, y: 10 },
                        { x: 2, y: 100000 },
                    ],
                },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: {
                            domain: [0, 10],
                            zoom: { extent: [0, 100000] },
                        },
                    },
                },
            },
            context
        );

        const axis = findAxisView(root, "left");
        const labelsView = findLabelsView(axis);
        const ticksView = axis
            .getDescendants()
            .find((view) => view instanceof UnitView && view.name === "ticks");

        const initialExtent = axis.getPerpendicularSize();

        await settleLayout(root, context);

        const afterInitialLayout = axis.getPerpendicularSize();
        const rootContainer = /** @type {import("./concatView.js").default} */ (
            root
        );
        const firstChild = /** @type {import("./view.js").default} */ (
            rootContainer.children[0]
        );

        await firstChild.getScaleResolution("y").zoomTo([0, 100000], 0);
        await flushMicrotasks();

        expect(axis.getPerpendicularSize()).toBeGreaterThan(
            Math.max(initialExtent, afterInitialLayout)
        );
        expect(findLabelsView(axis)).toBe(labelsView);
        expect(
            axis
                .getDescendants()
                .find(
                    (view) => view instanceof UnitView && view.name === "ticks"
                )
        ).toBe(ticksView);
    });

    test("implicit and explicit quantitative domains settle to the same y-axis extent", async () => {
        const values = [0, 10];

        /** @type {import("../spec/root.js").RootSpec} */
        const baseSpec = {
            data: { values },
            mark: "point",
            encoding: {
                y: { field: "data", type: "quantitative" },
            },
            view: { stroke: "lightgray" },
        };

        const implicitSnapshot = await getSettledAxisSnapshot(baseSpec, "left");
        const explicitSnapshot = await getSettledAxisSnapshot(
            {
                ...baseSpec,
                encoding: {
                    ...baseSpec.encoding,
                    y: {
                        ...baseSpec.encoding.y,
                        scale: {
                            domain: [0, 10],
                            zoom: { extent: [-100000, 100000] },
                        },
                    },
                },
            },
            "left"
        );

        expect(implicitSnapshot.extent).toBe(explicitSnapshot.extent);
    });
});
