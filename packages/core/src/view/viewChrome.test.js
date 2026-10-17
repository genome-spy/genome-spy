import { expect, test } from "vitest";
import LayerView from "./layerView.js";
import UnitView from "./unitView.js";
import { createHeadlessEngine, createTestViewContext } from "./testUtils.js";
import { createGeneratedChromeOverlay } from "./gridView/generatedChromeOverlay.js";
import { markViewAsChrome } from "./viewSelectors.js";

test("chrome resolves scales without contributing or conflicting with authored guides", async () => {
    const { view, context } = await createHeadlessEngine({
        data: { values: [{ x: 1, group: "A" }] },
        axes: { x: { title: "Position", grid: true } },
        legends: { color: { title: "Category" } },
        layer: [
            {
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    color: { field: "group", type: "nominal" },
                },
            },
        ],
    });
    const root = /** @type {LayerView} */ (view);
    const authored = root.children[0];
    const axis = root.resolutions.axis.x;
    const legend = root.resolutions.legend.color;
    const overlay = createGeneratedChromeOverlay({
        spec: { layer: [] },
        context,
        layoutParent: root,
        dataParent: root,
        name: "overlay",
    });

    for (const layoutParent of [root, overlay.view]) {
        // Layout ancestry suppresses guides even when the data parent is authored.
        const chrome = new UnitView(
            {
                mark: "point",
                encoding: {
                    x: { datum: 2, type: "quantitative", axis: null },
                    y: { datum: 3, type: "quantitative" },
                    color: {
                        datum: "A",
                        type: "nominal",
                        legend: { title: "Decorative" },
                    },
                },
            },
            context,
            layoutParent,
            root,
            "decoration",
            {
                chrome: layoutParent === root,
                resolutionBoundaryChannels: ["y"],
            }
        );

        expect(chrome.getScaleResolution("x")).toBe(
            authored.getScaleResolution("x")
        );
        expect(chrome.getScaleResolution("color")).toBe(
            authored.getScaleResolution("color")
        );
        expect(chrome.resolutions.scale.y).toBeDefined();
        expect(chrome.getAxisResolution("y")).toBeUndefined();
        expect(chrome.getAxisResolution("x")).toBe(axis);
        expect(chrome.getLegendResolution("color")).toBe(legend);
    }

    expect(axis.getDebugState().members.map((member) => member.view)).toEqual([
        authored,
    ]);
    expect(axis.getAxisProps().grid).toBe(true);
    expect(axis.getTitle()).toBe("Position");
    expect(axis.isVisible()).toBe(true);
    expect(legend.getDebugState().members.map((member) => member.view)).toEqual(
        [authored]
    );
    expect(legend.getLegendDefs()[0].legend.title).toBe("Category");
});

test("chrome exclusion applies to descendants only when the subtree is excluded", () => {
    const context = createTestViewContext();

    for (const skipSubtree of [false, true]) {
        const parent = new LayerView(
            { layer: [] },
            context,
            null,
            null,
            "parent"
        );
        markViewAsChrome(parent, { skipSubtree });
        const child = new UnitView(
            {
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    color: { field: "group", type: "nominal" },
                },
            },
            context,
            parent,
            parent,
            "child"
        );

        expect(child.getScaleResolution("x")).toBeDefined();
        expect(child.getScaleResolution("color")).toBeDefined();
        expect(parent.resolutions.axis.x !== undefined).toBe(!skipSubtree);
        expect(parent.resolutions.legend.color !== undefined).toBe(
            !skipSubtree
        );
    }
});
