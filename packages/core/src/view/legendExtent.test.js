import { describe, expect, test } from "vitest";

import LegendView from "./legendView.js";
import Rectangle from "./layout/rectangle.js";
import ViewRenderingContext from "./renderingContext/viewRenderingContext.js";
import { createBroadcastingTestViewContext } from "./testUtils.js";
import { VIEW_ROOT_NAME } from "./viewFactory.js";
import { checkForDuplicateScaleNames } from "./viewUtils.js";
import { initializeViewData } from "../genomeSpy/viewDataInit.js";

/**
 * @typedef {import("./testUtils.js").BroadcastingViewContext} BroadcastingViewContext
 */

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

    /**
     * @param {import("../marks/mark.js").default} _mark
     */
    renderMark(_mark) {
        //
    }
}

/**
 * @param {import("./view.js").default} root
 */
function findLegendView(root) {
    /** @type {LegendView | undefined} */
    let legendView;

    root.visit((view) => {
        if (view instanceof LegendView) {
            legendView = view;
        }
    });

    if (!legendView) {
        throw new Error("Legend not found.");
    }

    return legendView;
}

/**
 * @param {import("../spec/root.js").RootSpec} spec
 * @param {BroadcastingViewContext} context
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
 * @param {BroadcastingViewContext} context
 */
function reflow(root, context) {
    root.render(
        new NoOpRenderingContext({ picking: false }),
        Rectangle.create(0, 0, 320, 240),
        {
            firstFacet: true,
        }
    );
    context.emitBroadcast(root, "layoutComputed");
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

/**
 * @param {import("./view.js").default} root
 * @param {BroadcastingViewContext} context
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

describe("Legend extent measurement", () => {
    test("long symbol labels increase right legend extent after layout", async () => {
        const context = createBroadcastingTestViewContext();
        const root = await createAndInitializeRoot(
            {
                config: { legend: { disable: false } },
                data: {
                    values: [
                        {
                            x: 1,
                            y: 1,
                            category:
                                "A very long legend label that needs more than the default extent",
                        },
                        {
                            x: 2,
                            y: 2,
                            category: "Short",
                        },
                    ],
                },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                    color: { field: "category", type: "nominal" },
                },
            },
            context
        );
        const legend = findLegendView(root);

        await settleLayout(root, context);

        expect(legend.getPerpendicularSize()).toBeGreaterThan(80);
    });
});
