import { expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import ScaleGroupsSource, { splitScaleGroups } from "./scaleGroupsSource.js";
import DataSource from "../dataSource.js";
import { registerLazyDataSource } from "./lazyDataSourceRegistry.js";
import {
    isSubtreeReady,
    isSubtreeLazyReady,
} from "../../../view/dataReadiness.js";

/** @param {Partial<import("../../../spec/view.js").LayerSpec>} [overrides]
 * @param {Parameters<typeof createHeadlessEngine>[1]} [options]
 */
async function createGroups(overrides = {}, options) {
    const engine = await createHeadlessEngine(
        {
            params: [
                { name: "cuts", value: [10] },
                { name: "width", value: 6 },
            ],
            data: { values: [{ x: 0 }, { x: 19 }] },
            scales: {
                x: {
                    type: "index",
                    gapPositions: { expr: "cuts" },
                    gapWidth: { expr: "width" },
                },
            },
            layer: [
                {
                    name: "points",
                    mark: "point",
                    encoding: { x: { field: "x", type: "index", axis: null } },
                },
                {
                    name: "groups",
                    domainInert: true,
                    data: { lazy: { type: "scaleGroups", channels: ["x"] } },
                    mark: "rect",
                    encoding: {
                        x: {
                            field: "xStart",
                            type: "index",
                            band: 0,
                            axis: null,
                        },
                        x2: { field: "xEnd", band: 0 },
                    },
                },
            ],
            ...overrides,
        },
        options
    );
    const groupView =
        /** @type {import("../../../view/unitView.js").default} */ (
            engine.view.getDescendants().find((v) => v.name === "groups")
        );
    const source = /** @type {ScaleGroupsSource} */ (
        groupView.flowHandle.dataSource
    );
    const rows = () =>
        Array.from(groupView.getCollector().getData(), (row) =>
            Object.fromEntries(
                Object.entries(row).filter(([key]) => key !== "__uniqueId")
            )
        );
    return { ...engine, groupView, source, rows };
}

test("splits finite half-open bounds only at interior cuts", () => {
    expect(splitScaleGroups([0, 20], [0, 5, 20, 30])).toEqual([
        [0, 5],
        [5, 20],
    ]);
    expect(splitScaleGroups([], [5])).toEqual([]);
    expect(() => splitScaleGroups([0, Infinity], [])).toThrow("finite");
});

test("selection-linked navigation uses the independent initial fallback", async () => {
    const { view } = await createHeadlessEngine({
        params: [{ name: "brush", value: null }],
        data: { values: [{ x: 0 }, { x: 19 }] },
        resolve: { scale: { x: "independent" } },
        vconcat: [
            {
                params: [
                    {
                        name: "brush",
                        select: { type: "interval", encodings: ["x"] },
                        push: "outer",
                    },
                ],
                mark: "point",
                encoding: { x: { field: "x", type: "index", axis: null } },
            },
            {
                scales: {
                    x: {
                        type: "index",
                        domain: { param: "brush" },
                        gapPositions: [10],
                    },
                },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "index", axis: null },
                        },
                    },
                    {
                        name: "groups",
                        domainInert: true,
                        data: {
                            lazy: { type: "scaleGroups", channels: ["x"] },
                        },
                        mark: "rect",
                        encoding: {
                            x: {
                                field: "xStart",
                                type: "index",
                                band: 0,
                                axis: null,
                            },
                            x2: { field: "xEnd", band: 0 },
                        },
                    },
                ],
            },
        ],
    });
    try {
        const groups =
            /** @type {import("../../../view/unitView.js").default} */ (
                view.getDescendants().find((v) => v.name === "groups")
            );
        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [4, 8] },
        });
        view.paramRuntime.flushNow();
        expect(groups.getScaleResolution("x").getDomain()).toEqual([4, 8]);
        expect(
            Array.from(groups.getCollector().getData(), (row) => [
                row.xStart,
                row.xEnd,
            ])
        ).toEqual([
            [0, 10],
            [10, 20],
        ]);
    } finally {
        view.disposeSubtree();
    }
});

test("uses the existing reversed inclusive-domain normalization exactly once", async () => {
    const { view, rows } = await createGroups({
        scales: {
            x: {
                type: "index",
                domain: [19, 0],
                gapPositions: [10],
                reverse: true,
            },
        },
    });
    try {
        expect(view.getScaleResolution("x").getDomain()).toEqual([-1, 19]);
        expect(rows()).toEqual([
            { xGroup: 0, xStart: -1, xEnd: 10 },
            { xGroup: 1, xStart: 10, xEnd: 19 },
        ]);
    } finally {
        view.disposeSubtree();
    }
});

test("accepts a resolved index scale with quantitative data encodings", async () => {
    const { view, rows } = await createGroups({
        layer: [
            {
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative", axis: null },
                },
            },
            {
                name: "groups",
                domainInert: true,
                data: { lazy: { type: "scaleGroups", channels: ["x"] } },
                mark: "rect",
                encoding: {
                    x: {
                        field: "xStart",
                        type: "quantitative",
                        band: 0,
                        axis: null,
                    },
                    x2: { field: "xEnd", band: 0 },
                },
            },
        ],
    });
    try {
        expect(rows()).toEqual([
            { xGroup: 0, xStart: 0, xEnd: 10 },
            { xGroup: 1, xStart: 10, xEnd: 19 },
        ]);
    } finally {
        view.disposeSubtree();
    }
});

test.each([false, true])(
    "waits for an outside contributor, including a ready empty extent: %s",
    async (empty) => {
        const started = Promise.withResolvers();
        const released = Promise.withResolvers();
        class PendingSource extends DataSource {
            async load() {
                started.resolve();
                await released.promise;
                this.reset();
                this.beginBatch({ type: "file" });
                if (!empty) {
                    this._propagate({ x: 0 });
                    this._propagate({ x: 19 });
                }
                this.complete();
            }
        }
        const unregister = registerLazyDataSource(
            /** @type {any} */ (
                (/** @type {any} */ params) =>
                    params.type === "pendingGroupsTest"
            ),
            PendingSource
        );
        /** @type {ScaleGroupsSource} */
        let source;
        const initialization = createGroups(
            {
                data: {
                    lazy: /** @type {any} */ ({ type: "pendingGroupsTest" }),
                },
            },
            {
                onDataFlowBuilt: (flow) => {
                    source = /** @type {ScaleGroupsSource} */ (
                        flow.dataSources.find(
                            (s) => s instanceof ScaleGroupsSource
                        )
                    );
                },
            }
        );
        await started.promise;
        try {
            expect(source.isDataReady()).toBe(false);
            expect(isSubtreeReady(source.view, {})).toBe(false);
            expect(isSubtreeLazyReady(source.view, {})).toBe(true);
            const completion = vi.spyOn(source, "complete");
            released.resolve();
            const { view, rows } = await initialization;
            expect(source.isDataReady()).toBe(true);
            expect(isSubtreeReady(source.view, {})).toBe(true);
            expect(rows()).toHaveLength(empty ? 0 : 2);
            expect(completion).toHaveBeenCalled();
            view.disposeSubtree();
        } finally {
            released.resolve();
            unregister();
        }
    }
);

test("locus groups span the assembly, including unloaded chromosomes, and follow assembly replacement", async () => {
    const assembly = {
        contigs: [
            { name: "chr1", size: 10 },
            { name: "chr2", size: 20 },
        ],
    };
    const { view, rows } = await createGroups({
        scales: { x: { type: "locus", assembly, gapPositions: "chromosomes" } },
        layer: [
            {
                mark: "point",
                data: { values: [{ x: 5 }] },
                encoding: { x: { field: "x", type: "locus", axis: null } },
            },
            {
                name: "groups",
                domainInert: true,
                data: { lazy: { type: "scaleGroups", channels: ["x"] } },
                mark: "rect",
                encoding: {
                    x: { field: "xStart", type: "locus", band: 0, axis: null },
                    x2: { field: "xEnd", band: 0 },
                },
            },
        ],
    });
    try {
        expect(rows()).toEqual([
            { xGroup: 0, xStart: 0, xEnd: 10 },
            { xGroup: 1, xStart: 10, xEnd: 30 },
        ]);
        view.getScaleResolution("x").attachViewLevelScaleProps(view, {
            type: "locus",
            assembly: { contigs: [{ name: "chrA", size: 40 }] },
            gapPositions: "chromosomes",
        });
        view.paramRuntime.flushNow();
        expect(rows()).toEqual([{ xGroup: 0, xStart: 0, xEnd: 40 }]);
    } finally {
        view.disposeSubtree();
    }
});

test("replays current rows after exterior cut edits and disposes its effect", async () => {
    const { view, groupView, source, rows } = await createGroups();
    try {
        const x = view.getScaleResolution("x");
        x.attachViewLevelScaleProps(view, {
            type: "index",
            domain: [0, 19],
            gapPositions: [30],
        });
        const complete = vi.spyOn(source, "complete");
        source.repropagate();
        expect(complete).toHaveBeenCalledOnce();
        expect(rows()).toEqual([{ xGroup: 0, xStart: 0, xEnd: 20 }]);
        complete.mockClear();
        groupView.disposeSubtree();
        x.attachViewLevelScaleProps(view, {
            type: "index",
            domain: [0, 19],
            gapPositions: [10],
        });
        expect(complete).not.toHaveBeenCalled();
    } finally {
        view.disposeSubtree();
    }
});

test("publishes the finalized inferred reference and only rebuilds for effective grouping changes", async () => {
    const { view, source, rows } = await createGroups();
    try {
        expect(source.isDataReady()).toBe(true);
        expect(rows()).toEqual([
            { xGroup: 0, xStart: 0, xEnd: 10 },
            { xGroup: 1, xStart: 10, xEnd: 20 },
        ]);
        const publish = vi.spyOn(source, "complete");
        const x = view.getScaleResolution("x");
        await x.zoomTo([5, 14]);
        view.paramRuntime.setValue("width", 12);
        view.paramRuntime.flushNow();
        expect(publish).not.toHaveBeenCalled();

        view.paramRuntime.setValue("width", 0);
        view.paramRuntime.flushNow();
        expect(rows()).toEqual([{ xGroup: 0, xStart: 0, xEnd: 20 }]);
        view.paramRuntime.setValue("cuts", [5]);
        view.paramRuntime.setValue("width", 6);
        view.paramRuntime.flushNow();
        expect(rows()).toEqual([
            { xGroup: 0, xStart: 0, xEnd: 5 },
            { xGroup: 1, xStart: 5, xEnd: 20 },
        ]);
        publish.mockClear();
        source.repropagate();
        expect(publish).toHaveBeenCalledOnce();
        expect(x.getDomain()).toEqual([5, 15]);
    } finally {
        view.disposeSubtree();
    }
});

test("authored reactive full extents remain independent of navigation", async () => {
    const { view, rows } = await createGroups({
        params: [{ name: "extent", value: [0, 19] }],
        scales: {
            x: {
                type: "index",
                domain: { expr: "extent" },
                gapPositions: [10],
            },
        },
    });
    try {
        expect(rows().at(-1).xEnd).toBe(20);
        await view.getScaleResolution("x").zoomTo([4, 8]);
        view.paramRuntime.setValue("extent", [0, 29]);
        view.paramRuntime.flushNow();
        expect(rows().at(-1).xEnd).toBe(30);
    } finally {
        view.disposeSubtree();
    }
});

test("an empty inferred extent is ready and stays frozen after later streaming data", async () => {
    const { view, source, rows } = await createGroups({ data: { values: [] } });
    try {
        expect(source.isDataReady()).toBe(true);
        expect(rows()).toEqual([]);
        /** @type {import("../inlineSource.js").default} */ (
            view.flowHandle.dataSource
        ).updateDynamicData([{ x: 0 }, { x: 29 }]);
        expect(rows()).toEqual([]);
    } finally {
        view.disposeSubtree();
    }
});

test("two axes form a deterministic product without feeding half-open ends back into domains", async () => {
    const { view, rows } = await createGroups({
        scales: {
            x: { type: "index", domain: [0, 19], gapPositions: [10] },
            y: { type: "index", domain: [0, 9], gapPositions: [5] },
        },
        layer: [
            {
                mark: "point",
                encoding: {
                    x: { field: "x", type: "index", axis: null },
                    y: { value: 0.5 },
                },
            },
            {
                name: "groups",
                domainInert: true,
                data: { lazy: { type: "scaleGroups", channels: ["x", "y"] } },
                mark: "rect",
                encoding: {
                    x: { field: "xStart", type: "index", band: 0, axis: null },
                    x2: { field: "xEnd", band: 0 },
                    y: { field: "yStart", type: "index", band: 0, axis: null },
                    y2: { field: "yEnd", band: 0 },
                },
            },
        ],
    });
    try {
        expect(rows()).toEqual([
            { xGroup: 0, xStart: 0, xEnd: 10, yGroup: 0, yStart: 0, yEnd: 5 },
            { xGroup: 0, xStart: 0, xEnd: 10, yGroup: 1, yStart: 5, yEnd: 10 },
            { xGroup: 1, xStart: 10, xEnd: 20, yGroup: 0, yStart: 0, yEnd: 5 },
            { xGroup: 1, xStart: 10, xEnd: 20, yGroup: 1, yStart: 5, yEnd: 10 },
        ]);
        expect(view.getScaleResolution("x").getDomain()).toEqual([0, 20]);
        expect(view.getScaleResolution("y").getDomain()).toEqual([0, 10]);
    } finally {
        view.disposeSubtree();
    }
});
