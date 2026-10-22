import { expect, onTestFinished, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import Rectangle from "./layout/rectangle.js";
import { renderToLayout } from "./testUtils.js";

test.each(
    /** @type {const} */ ([
        ["width", "x"],
        ["height", "y"],
    ])
)(
    "computed aliases track automatic %s when a child shadows it",
    async (dimension, channel) => {
        /** @type {import("../spec/view.js").UnitSpec[]} */
        const children = [
            {
                mark: "point",
                [dimension]: 80,
                encoding: {
                    [channel]: {
                        field: "value",
                        type: "quantitative",
                        scale: {
                            domain: { expr: "[0, sharedSize]" },
                            nice: false,
                        },
                    },
                },
            },
            {
                mark: "point",
                [dimension]: 160,
                encoding: {
                    [channel]: { field: "value", type: "quantitative" },
                },
            },
        ];
        /** @type {Pick<import("../spec/root.js").RootSpec, "params" | "data">} */
        const common = {
            params: [{ name: "sharedSize", expr: dimension }],
            data: { values: [] },
        };
        const { view } = await createHeadlessEngine(
            dimension === "width"
                ? { ...common, vconcat: children }
                : { ...common, hconcat: children }
        );
        onTestFinished(() => view.disposeSubtree());
        const child = /** @type {import("./concatView.js").default} */ (view)
            .children[0];

        // The alias must bind the container's automatic dimension before its children exist.
        renderToLayout(view, Rectangle.create(0, 0, 400, 200));
        await view.paramRuntime.whenPropagated();
        const size = view.paramRuntime.getValue(dimension);
        expect(size).not.toBe(child.paramRuntime.getValue(dimension));
        expect(child.getScaleResolution(channel).getDomain()).toEqual([
            0,
            size,
        ]);

        renderToLayout(view, Rectangle.create(0, 0, 600, 300));
        await view.paramRuntime.whenPropagated();
        const resized = view.paramRuntime.getValue(dimension);
        expect(resized).toBeGreaterThan(size);
        expect(child.getScaleResolution(channel).getDomain()).toEqual([
            0,
            resized,
        ]);
    }
);

test("authored width and height parameters take precedence over automatic dimensions", async () => {
    const { view } = await createHeadlessEngine({
        params: [
            { name: "width", value: 120 },
            { name: "height", value: 60 },
            { name: "sizeSum", expr: "width + height" },
        ],
        data: { values: [] },
        mark: "point",
        encoding: {
            x: {
                field: "value",
                type: "quantitative",
                scale: { domain: { expr: "[0, sizeSum]" } },
            },
        },
    });
    onTestFinished(() => view.disposeSubtree());
    renderToLayout(view, Rectangle.create(0, 0, 400, 200));
    await view.paramRuntime.whenPropagated();
    expect(view.paramRuntime.getValue("width")).toBe(120);
    expect(view.paramRuntime.getValue("height")).toBe(60);
    expect(view.getScaleResolution("x").getDomain()).toEqual([0, 180]);
});
