import { describe, expect, test, vi } from "vitest";

import ConcatView from "../concatView.js";
import LegendView from "../legendView.js";
import UnitView from "../unitView.js";
import { create } from "../testUtils.js";
import { syncViewGuideViews } from "./guideViewSync.js";
import {
    createIndexColorPlotSpec,
    createLegendTestView,
    getLegendRegions,
    getLegendTitles,
    getLegends,
} from "./legendTestUtils.js";

describe("root legend placement", () => {
    test("collects independent descendant legends at the root", async () => {
        const view = await createLegendTestView({
            config: {
                legend: {
                    disable: false,
                    placement: "root",
                    layout: { right: { direction: "horizontal" } },
                },
            },
            resolve: {
                scale: { color: "independent" },
                legend: { color: "independent" },
            },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, group: "alpha" },
                            { x: 2, y: 3, group: "beta" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "group",
                            type: "nominal",
                            legend: { title: "Group" },
                        },
                    },
                },
                {
                    data: {
                        values: [
                            { x: 1, y: 4, status: "open" },
                            { x: 2, y: 5, status: "closed" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "status",
                            type: "nominal",
                            legend: { title: "Status" },
                        },
                    },
                },
            ],
        });
        const legends = getLegends(view);
        const [region] = getLegendRegions(view);

        expect(legends).toHaveLength(2);
        expect(getLegendTitles(view)).toEqual(["Group", "Status"]);
        expect(getLegendRegions(view)).toHaveLength(1);
        expect(region.getWidth()).toBeGreaterThan(
            Math.max(...legends.map((legend) => legend.getPerpendicularSize()))
        );
    });

    test("builds root legends once after nested concat initialization", async () => {
        const initializeChildren = vi.spyOn(
            LegendView.prototype,
            "initializeChildren"
        );

        try {
            await createLegendTestView({
                config: {
                    legend: { disable: false, placement: "root" },
                },
                resolve: {
                    scale: { color: "independent" },
                    legend: { color: "independent" },
                },
                vconcat: [
                    {
                        vconcat: [
                            createIndexColorPlotSpec(),
                            createIndexColorPlotSpec(),
                        ],
                    },
                ],
            });

            expect(initializeChildren).toHaveBeenCalledTimes(2);
        } finally {
            initializeChildren.mockRestore();
        }
    });

    test("allows local and root legends to coexist", async () => {
        const view = await createLegendTestView({
            config: { legend: { disable: false } },
            resolve: {
                scale: { color: "independent" },
                legend: { color: "independent" },
            },
            vconcat: [
                {
                    data: {
                        values: [
                            { x: 1, y: 2, group: "alpha" },
                            { x: 2, y: 3, group: "beta" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "group",
                            type: "nominal",
                            legend: {
                                title: "Collected",
                                placement: "root",
                            },
                        },
                    },
                },
                {
                    data: {
                        values: [
                            { x: 1, y: 4, status: "open" },
                            { x: 2, y: 5, status: "closed" },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                        color: {
                            field: "status",
                            type: "nominal",
                            legend: { title: "Local" },
                        },
                    },
                },
            ],
        });

        expect(getLegends(view)).toHaveLength(2);
        expect(getLegendRegions(view)).toHaveLength(2);
        expect(getLegendTitles(view).sort()).toEqual(["Collected", "Local"]);
    });

    test("keeps root legends synchronized across child mutations", async () => {
        const view = await createLegendTestView({
            config: {
                legend: {
                    disable: false,
                    placement: "root",
                    layout: { anchor: "middle" },
                },
            },
            resolve: {
                scale: { color: "independent" },
                legend: { color: "independent" },
            },
            vconcat: [createIndexColorPlotSpec(40)],
        });

        expect(getLegends(view)).toHaveLength(1);
        expect(getLegendRegions(view)).toHaveLength(1);
        expect(getLegendRegions(view)[0].getAnchor()).toBe("middle");

        await view.addChildSpec({
            ...createIndexColorPlotSpec(40),
            encoding: {
                ...createIndexColorPlotSpec(40).encoding,
                color: {
                    field: "Origin",
                    type: "nominal",
                    legend: { title: "Inserted" },
                },
            },
        });

        expect(getLegends(view)).toHaveLength(2);
        expect(getLegendRegions(view)).toHaveLength(1);

        await view.removeChildAt(1);

        expect(getLegends(view)).toHaveLength(1);
        expect(getLegendRegions(view)).toHaveLength(1);
    });

    test("uses an implicit root as the root legend collector", async () => {
        const view = await create(
            /** @type {import("../../spec/root.js").RootSpec} */ ({
                config: {
                    legend: { disable: false, placement: "root" },
                },
                data: {
                    values: [
                        { x: 1, y: 2, group: "alpha" },
                        { x: 2, y: 3, group: "beta" },
                    ],
                },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                    color: { field: "group", type: "nominal" },
                },
            }),
            ConcatView,
            { wrapRoot: true }
        );

        expect(view.name).toBe("implicitRoot");
        expect(getLegends(view)).toHaveLength(1);
        expect(getLegendRegions(view)).toHaveLength(1);
    });

    test("fails clearly when root placement has no root grid", async () => {
        const view = await create(
            /** @type {import("../../spec/root.js").RootSpec} */ ({
                config: {
                    legend: { disable: false, placement: "root" },
                },
                data: {
                    values: [
                        { x: 1, y: 2, group: "alpha" },
                        { x: 2, y: 3, group: "beta" },
                    ],
                },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                    color: { field: "group", type: "nominal" },
                },
            }),
            UnitView,
            { wrapRoot: false }
        );

        await expect(syncViewGuideViews(view)).rejects.toThrow(
            'Legend placement "root" requires an effective root GridView'
        );
    });
});
