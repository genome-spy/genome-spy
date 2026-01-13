import { describe, expect, test } from "vitest";

import ConcatView from "./concatView.js";
import DataSource from "../data/sources/dataSource.js";
import UnitView from "./unitView.js";
import View from "./view.js";
import { create, createTestViewContext } from "./testUtils.js";

class DisposableView extends View {
    /** @type {boolean} */
    disposed = false;

    /**
     * @param {string} name
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     */
    constructor(name, context, layoutParent, dataParent) {
        super({ name }, context, layoutParent, dataParent, name);
    }

    dispose() {
        this.disposed = true;
    }
}

describe("View disposal", () => {
    test("removes scale and axis resolutions for disposed unit views", async () => {
        /** @type {import("../spec/view.js").UnitSpec} */
        const spec = {
            data: {
                values: [
                    {
                        x: 1,
                        y: 2,
                    },
                ],
            },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        const view = await create(spec, UnitView);

        expect(view.getScaleResolution("x")).toBeDefined();
        expect(view.getAxisResolution("x")).toBeDefined();

        view.disposeSubtree();

        expect(view.getScaleResolution("x")).toBeUndefined();
        expect(view.getAxisResolution("x")).toBeUndefined();
    });

    test("disposes replaced grid children", () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { hconcat: [] },
            context,
            null,
            null,
            "c"
        );

        const childA = new DisposableView("a", context, parent, parent);
        const childB = new DisposableView("b", context, parent, parent);
        parent.setChildren([childA, childB]);

        const childC = new DisposableView("c", context, parent, parent);
        parent.setChildren([childC]);

        expect(childA.disposed).toBe(true);
        expect(childB.disposed).toBe(true);
        expect(childC.disposed).toBe(false);

        const childD = new DisposableView("d", context, parent, parent);
        parent.replaceChild(childC, childD);

        expect(childC.disposed).toBe(true);
        expect(childD.disposed).toBe(false);
    });

    test("removes dataflow hosts on dispose", () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { hconcat: [] },
            context,
            null,
            null,
            "c"
        );
        const child = new DisposableView("a", context, parent, parent);

        const dataSource = new DataSource(child);
        context.dataFlow.addDataSource(dataSource, child);

        expect(context.dataFlow.findDataSourceByKey(child)).toBe(dataSource);

        child.disposeSubtree();

        expect(context.dataFlow.findDataSourceByKey(child)).toBeUndefined();
    });
});
