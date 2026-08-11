import { describe, expect, test } from "vitest";
import { create, createAndInitialize, specToLayout } from "../testUtils.js";
import ConcatView from "../concatView.js";
import UnitView from "../unitView.js";
import LegendView, { LegendRegionView } from "../legendView.js";
import { findLegendCollectionDeclaration } from "./legendCollection.js";
import { syncViewGuideViews } from "./guideViewSync.js";
import Rectangle from "../layout/rectangle.js";

/**
 * @param {string} name
 * @param {string} title
 * @param {import("../../spec/legend.js").LegendOrient} [orient]
 * @returns {import("../../spec/view.js").UnitSpec}
 */
function makeColorUnit(name, title, orient = "right") {
    return {
        name,
        data: {
            values: [
                { value: 0, category: "a" },
                { value: 1, category: "b" },
            ],
        },
        mark: "point",
        encoding: {
            x: { field: "value", type: "quantitative", axis: null },
            color: {
                field: "category",
                type: "nominal",
                legend: { title, orient },
            },
        },
    };
}

/** @param {ConcatView} view */
function getDirectLegendRegions(view) {
    return Array.from(view).filter(
        (child) => child instanceof LegendRegionView
    );
}

/** @param {LegendRegionView} region */
function getLegendViews(region) {
    return region.getDescendants().filter((view) => view instanceof LegendView);
}

/**
 * @typedef {{ viewName: string, coords?: string, children: LayoutNode[] }} LayoutNode
 *
 * @param {LayoutNode} node
 * @param {string} viewName
 * @returns {LayoutNode | undefined}
 */
function findLayoutNode(node, viewName) {
    if (node.viewName == viewName) {
        return node;
    }

    for (const child of node.children) {
        const found = findLayoutNode(child, viewName);
        if (found) {
            return found;
        }
    }
}

/**
 * @param {string} coords
 * @param {"width" | "height"} dimension
 */
function getLayoutSize(coords, dimension) {
    return Number(coords.match(new RegExp(`${dimension}: (-?\\d+)`))[1]);
}

describe("collected legend routing", () => {
    test("collects independent legends without merging their resolutions", async () => {
        const root = await createAndInitialize(
            {
                config: { legend: { disable: false } },
                resolve: {
                    scale: { color: "independent" },
                    legend: { color: "collected" },
                },
                hconcat: [
                    makeColorUnit("first", "First"),
                    makeColorUnit("second", "Second"),
                ],
            },
            ConcatView
        );
        const first = root.findDescendantByName("first");
        const second = root.findDescendantByName("second");

        expect(first.getLegendResolution("color")).not.toBe(
            second.getLegendResolution("color")
        );
        const [region] = getDirectLegendRegions(root);
        expect(getDirectLegendRegions(root)).toHaveLength(1);
        expect(
            getLegendViews(region).map((legend) => legend.legendProps.title)
        ).toEqual(["First", "Second"]);
    });

    test("collects one legend when the scale is shared", async () => {
        const root = await createAndInitialize(
            {
                config: { legend: { disable: false } },
                resolve: {
                    scale: { color: "shared" },
                    legend: { color: "collected" },
                },
                hconcat: [
                    makeColorUnit("first", "Shared"),
                    makeColorUnit("second", "Shared"),
                ],
            },
            ConcatView
        );
        const first = root.findDescendantByName("first");
        const second = root.findDescendantByName("second");

        expect(first.getLegendResolution("color")).toBe(
            second.getLegendResolution("color")
        );
        const [region] = getDirectLegendRegions(root);
        expect(getDirectLegendRegions(root)).toHaveLength(1);
        expect(getLegendViews(region)).toHaveLength(1);
    });

    test("uses the nearest collector and respects excluded barriers", async () => {
        const root = await createAndInitialize(
            {
                config: { legend: { disable: false } },
                resolve: { legend: { color: "collected" } },
                hconcat: [
                    {
                        name: "nearest",
                        resolve: { legend: { color: "collected" } },
                        vconcat: [makeColorUnit("nested", "Nested")],
                    },
                    {
                        name: "barrier",
                        resolve: { legend: { color: "excluded" } },
                        vconcat: [makeColorUnit("shielded", "Shielded")],
                    },
                    makeColorUnit("outer", "Outer"),
                ],
            },
            ConcatView
        );
        const nearest = /** @type {ConcatView} */ (
            root.findDescendantByName("nearest")
        );
        const nested = root.findDescendantByName("nested");
        const shielded = root.findDescendantByName("shielded");
        const outer = root.findDescendantByName("outer");

        expect(
            findLegendCollectionDeclaration(
                nested,
                nested.getLegendResolution("color").channel
            )
        ).toBe(nearest);
        expect(
            findLegendCollectionDeclaration(
                shielded,
                shielded.getLegendResolution("color").channel
            )
        ).toBeUndefined();
        expect(
            findLegendCollectionDeclaration(
                outer,
                outer.getLegendResolution("color").channel
            )
        ).toBe(root);

        expect(getLegendViews(getDirectLegendRegions(nearest)[0])).toHaveLength(
            1
        );
        expect(
            getLegendViews(getDirectLegendRegions(root).at(-1))
        ).toHaveLength(1);
    });

    test("collects an internally shared legend at an outer grid", async () => {
        const root = await createAndInitialize(
            {
                config: { legend: { disable: false } },
                resolve: { legend: { color: "collected" } },
                hconcat: [
                    {
                        name: "sharedGroup",
                        resolve: {
                            scale: { color: "shared" },
                            legend: { color: "shared" },
                        },
                        vconcat: [
                            makeColorUnit("first", "Shared"),
                            makeColorUnit("second", "Shared"),
                        ],
                    },
                ],
            },
            ConcatView
        );
        const sharedGroup = /** @type {ConcatView} */ (
            root.findDescendantByName("sharedGroup")
        );

        expect(getDirectLegendRegions(sharedGroup)).toHaveLength(0);
        expect(getLegendViews(getDirectLegendRegions(root)[0])).toHaveLength(1);
    });

    test("collects default channels while allowing a unit exclusion", async () => {
        const mixed = makeColorUnit("mixed", "Color", "top");
        const root = await createAndInitialize(
            {
                config: { legend: { disable: false } },
                resolve: { legend: { default: "collected" } },
                hconcat: [
                    {
                        ...mixed,
                        resolve: { legend: { size: "excluded" } },
                        encoding: {
                            ...mixed.encoding,
                            size: {
                                field: "value",
                                type: "quantitative",
                                legend: { title: "Size", orient: "right" },
                            },
                        },
                    },
                ],
            },
            ConcatView
        );

        const regions = getDirectLegendRegions(root);
        expect(regions.map((region) => region.orient).sort()).toEqual([
            "right",
            "top",
        ]);
        expect(
            getLegendViews(regions.find((region) => region.orient == "top"))
        ).toHaveLength(1);
        expect(
            getLegendViews(regions.find((region) => region.orient == "right"))
        ).toHaveLength(1);
    });

    test("sizes a collected bottom gradient against the destination grid", async () => {
        /** @returns {import("../../spec/view.js").UnitSpec} */
        const makeGradientUnit = (/** @type {string} */ name) => {
            return {
                name,
                width: 100,
                height: 80,
                data: {
                    values: [
                        { x: 0, value: 0 },
                        { x: 1, value: 10 },
                    ],
                },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative", axis: null },
                    color: {
                        field: "value",
                        type: "quantitative",
                        legend: { title: name, orient: "bottom" },
                    },
                },
            };
        };
        const layout = await specToLayout(
            {
                config: { legend: { disable: false } },
                spacing: 10,
                resolve: {
                    scale: { color: "independent" },
                    legend: { color: "collected" },
                },
                hconcat: [
                    makeGradientUnit("first"),
                    makeGradientUnit("second"),
                ],
            },
            {},
            Rectangle.create(0, 0, 240, 160)
        );
        const first = findLayoutNode(layout, "first");
        const region = findLayoutNode(layout, "legend_region_bottom");
        if (!first?.coords || !region?.coords) {
            throw new Error("Expected collected legend layout nodes");
        }

        expect(getLayoutSize(first.coords, "width")).toBe(100);
        expect(getLayoutSize(region.coords, "width")).toBe(240);
    });

    test("fails clearly when collection has no grid layout host", async () => {
        const unit = await create(
            {
                ...makeColorUnit("root", "Root"),
                resolve: { legend: { color: "collected" } },
            },
            UnitView,
            { wrapRoot: false }
        );

        await expect(syncViewGuideViews(unit)).rejects.toThrow(
            'Legend collection for channel "color" declared at view "root" requires a GridView layout host.'
        );
    });

    test("refreshes an outer collector after nested mutations", async () => {
        const root = await createAndInitialize(
            {
                config: { legend: { disable: false } },
                resolve: { legend: { color: "collected" } },
                hconcat: [
                    {
                        name: "nested",
                        vconcat: [makeColorUnit("first", "First")],
                    },
                ],
            },
            ConcatView
        );
        const nested = /** @type {ConcatView} */ (
            root.findDescendantByName("nested")
        );

        await nested.addChildSpec(makeColorUnit("second", "Second"));
        expect(
            getLegendViews(getDirectLegendRegions(root)[0]).map(
                (legend) => legend.legendProps.title
            )
        ).toEqual(["First", "Second"]);

        await nested.moveChildAt(1, 0);
        expect(
            getLegendViews(getDirectLegendRegions(root)[0]).map(
                (legend) => legend.legendProps.title
            )
        ).toEqual(["Second", "First"]);

        await nested.removeChildAt(0);
        expect(
            getLegendViews(getDirectLegendRegions(root)[0]).map(
                (legend) => legend.legendProps.title
            )
        ).toEqual(["First"]);
    });
});
