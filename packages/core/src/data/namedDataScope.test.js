import { describe, expect, onTestFinished, test, vi } from "vitest";

import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { initializeVisibleViewData } from "../genomeSpy/viewDataInit.js";
import { createViewMutationApi } from "../view/viewMutationApi.js";
import Collector from "./collector.js";
import { isDataReady, iterateDataDependencies } from "./dataReadiness.js";
import NamedSource from "./sources/namedSource.js";

/**
 * @param {import("../view/view.js").default} view
 */
function getRows(view) {
    return Array.from(view.flowHandle.collector.getData());
}

/**
 * @param {import("../view/view.js").default} root
 * @param {string} name
 */
function getView(root, name) {
    const view = root
        .getDescendants()
        .find((candidate) => candidate.explicitName === name);
    if (!view) {
        throw new Error(`View "${name}" not found.`);
    }
    return view;
}

describe("named dataset scopes", () => {
    test("resolves declarations lexically and shares only one binding", async () => {
        /** @type {import("../spec/root.js").RootSpec} */
        const spec = {
            datasets: {
                shared: [{ value: "root" }],
            },
            vconcat: [
                {
                    name: "rootConsumer",
                    data: { name: "shared" },
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "nominal" },
                    },
                },
                {
                    name: "localOwner",
                    datasets: {
                        shared: [{ value: "local" }],
                    },
                    vconcat: [
                        {
                            name: "localConsumerA",
                            data: { name: "shared" },
                            mark: "point",
                            encoding: {
                                x: { field: "value", type: "nominal" },
                            },
                        },
                        {
                            name: "localConsumerB",
                            data: { name: "shared" },
                            mark: "point",
                            encoding: {
                                x: { field: "value", type: "nominal" },
                            },
                        },
                    ],
                },
            ],
        };

        const { view, context } = await createHeadlessEngine(spec);
        const rootConsumer = getView(view, "rootConsumer");
        const localConsumerA = getView(view, "localConsumerA");
        const localConsumerB = getView(view, "localConsumerB");

        expect(getRows(rootConsumer).map((datum) => datum.value)).toEqual([
            "root",
        ]);
        expect(getRows(localConsumerA).map((datum) => datum.value)).toEqual([
            "local",
        ]);
        expect(getRows(localConsumerB).map((datum) => datum.value)).toEqual([
            "local",
        ]);

        expect(localConsumerA.flowHandle.dataSource).toBe(
            localConsumerB.flowHandle.dataSource
        );
        expect(rootConsumer.flowHandle.dataSource).not.toBe(
            localConsumerA.flowHandle.dataSource
        );
        expect(
            context.dataFlow.dataSources.filter(
                (source) => source instanceof NamedSource
            )
        ).toHaveLength(2);
        expect(() => context.dataFlow.findNamedDataSource("shared")).toThrow(
            /ambiguous.*ViewHandle\.datasets\.set/i
        );
    });

    test("keeps repeated imported dataset declarations independent", async () => {
        /** @type {import("../spec/root.js").RootSpec} */
        const spec = {
            templates: {
                panel: {
                    datasets: {
                        values: [{ value: "imported" }],
                    },
                    data: { name: "values" },
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "nominal" },
                    },
                },
            },
            vconcat: [
                {
                    name: "first",
                    import: { template: "panel" },
                },
                {
                    name: "second",
                    import: { template: "panel" },
                },
            ],
        };

        const { view } = await createHeadlessEngine(spec);
        const first = getView(view, "first");
        const second = getView(view, "second");

        expect(getRows(first).map((datum) => datum.value)).toEqual([
            "imported",
        ]);
        expect(getRows(second).map((datum) => datum.value)).toEqual([
            "imported",
        ]);
        expect(first.flowHandle.dataSource).not.toBe(
            second.flowHandle.dataSource
        );
        expect(first.flowHandle.dataSource.identifier).toBe("values");
        expect(second.flowHandle.dataSource.identifier).toBe("values");

        const api = createViewMutationApi({ viewRoot: view });
        api.get({ scope: ["first"], view: "first" }).datasets.set("values", [
            { value: "updated" },
        ]);

        expect(getRows(first).map((datum) => datum.value)).toEqual(["updated"]);
        expect(getRows(second).map((datum) => datum.value)).toEqual([
            "imported",
        ]);
    });

    test("resolves imported named lookup data from the imported root", async () => {
        /** @type {import("../spec/root.js").RootSpec} */
        const spec = {
            templates: {
                translation: {
                    datasets: {
                        geneticCode: [
                            { codon: "ATG", aminoAcid: "M" },
                            { codon: "TAA", aminoAcid: "STOP" },
                        ],
                    },
                    data: {
                        values: [{ codon: "ATG" }, { codon: "TAA" }],
                    },
                    transform: [
                        {
                            type: "lookup",
                            from: { name: "geneticCode" },
                            key: "codon",
                        },
                    ],
                    mark: "point",
                    encoding: {
                        x: { field: "codon", type: "nominal" },
                    },
                },
            },
            vconcat: [
                {
                    name: "translation",
                    import: { template: "translation" },
                },
            ],
        };

        const { view } = await createHeadlessEngine(spec);
        const translation = getView(view, "translation");

        expect(getRows(translation).map((datum) => datum.aminoAcid)).toEqual([
            "M",
            "STOP",
        ]);
    });

    test("resets an undeclared legacy binding to its provider", async () => {
        let providerRows = [{ value: "initial" }];
        const { view, context } = await createHeadlessEngine(
            {
                data: { name: "legacy" },
                mark: "point",
                encoding: {
                    x: { field: "value", type: "nominal" },
                },
            },
            {
                contextOptions: {
                    getNamedDataFromProvider: (name) =>
                        name === "legacy" ? providerRows : undefined,
                },
            }
        );
        const source =
            context.dataFlow.findNamedDataSource("legacy")?.dataSource;
        if (!source) {
            throw new Error("Expected legacy named source.");
        }

        source.updateDynamicData([{ value: "override" }]);
        expect(getRows(view).map((datum) => datum.value)).toEqual(["override"]);

        providerRows = [{ value: "refreshed" }];
        source.updateDynamicData();
        expect(getRows(view).map((datum) => datum.value)).toEqual([
            "refreshed",
        ]);
    });
});

describe("derived named datasets", () => {
    test("replays contiguous coverage groups after a derived lookup changes", async () => {
        /** @type {import("../spec/view.js").UnitSpec} */
        const summarySpec = {
            name: "summary",
            transform: [
                {
                    type: "lookup",
                    from: { name: "background" },
                    key: "state",
                    fields: "category",
                    values: ["q"],
                },
                {
                    type: "formula",
                    expr: "datum.count / datum.total - datum.q",
                    as: "score",
                },
                { type: "filter", expr: "isValid(datum.score)" },
                {
                    type: "stack",
                    field: "score",
                    groupby: ["start", "end"],
                    offset: "diverging",
                    sort: { field: "category" },
                },
            ],
            mark: "rect",
            encoding: {
                x: { field: "start", type: "quantitative" },
                x2: { field: "end" },
                y: { field: "y0", type: "quantitative" },
                y2: { field: "y1" },
            },
        };
        /** @type {Collector} */
        let coverageCache;
        let primaryCompletedBeforeTable = false;
        const { view, context } = await createHeadlessEngine(
            {
                datasets: {
                    calls: [
                        { start: 0, end: 2, state: "quiet" },
                        { start: 0, end: 4, state: "active" },
                    ],
                },
                params: [{ name: "activePrior", value: 0.25 }],
                data: { name: "calls" },
                transform: [
                    {
                        type: "branch",
                        transform: [
                            { type: "collect" },
                            {
                                type: "formula",
                                expr: "datum.state === 'active' ? activePrior : 1 - activePrior",
                                as: "q",
                            },
                            { type: "publish", dataset: "background" },
                        ],
                    },
                    {
                        type: "categoricalCoverage",
                        start: "start",
                        end: "end",
                        category: "state",
                    },
                ],
                hconcat: [
                    {
                        name: "coverage",
                        mark: { type: "rect", tooltip: null },
                        encoding: {
                            x: { field: "start", type: "quantitative" },
                            x2: { field: "end" },
                        },
                    },
                    summarySpec,
                ],
            },
            {
                onDataFlowBuilt(dataFlow) {
                    const source =
                        dataFlow.findNamedDataSource("calls").dataSource;

                    // Confirm that startup must replay the implicit collector
                    // once the derived side table publishes.
                    source.visit((node) => {
                        if (
                            node.label === "lookup" &&
                            node.parent instanceof Collector
                        ) {
                            coverageCache = node.parent;
                            const [table] = node.dataDependencies;
                            onTestFinished(
                                coverageCache.observe(() => {
                                    primaryCompletedBeforeTable ||=
                                        !table.completed;
                                })
                            );
                        }
                    });
                },
            }
        );
        onTestFinished(() => view.disposeSubtree());

        /** @param {import("../view/view.js").default} summary */
        const offsets = (summary) =>
            getRows(summary).map(({ start, end, category, y0, y1 }) => [
                start,
                end,
                category,
                y0,
                y1,
            ]);
        const summary = getView(view, "summary");
        expect(primaryCompletedBeforeTable).toBe(true);
        expect(isDataReady(summary.flowHandle.collector)).toBe(true);
        expect(offsets(summary)).toEqual([
            [0, 2, "active", 0, 0.25],
            [0, 2, "quiet", -0.25, 0],
            [2, 4, "active", 0, 0.75],
        ]);

        const initialRevision = coverageCache.dataRevision;
        const source = context.dataFlow.findNamedDataSource("calls").dataSource;
        const load = vi.spyOn(source, "load");
        onTestFinished(() => load.mockRestore());
        view.paramRuntime.setValue("activePrior", 0.75);
        await view.paramRuntime.whenPropagated();
        expect(offsets(summary)).toEqual([
            [0, 2, "active", -0.25, 0],
            [0, 2, "quiet", 0, 0.25],
            [2, 4, "active", 0, 0.25],
        ]);
        expect(coverageCache.dataRevision).toBe(initialRevision);

        const parent = /** @type {import("../view/concatView.js").default} */ (
            view
        );
        const inserted = await context.createOrImportView(
            { ...summarySpec, name: "inserted" },
            parent,
            getView(view, "coverage"),
            "inserted"
        );
        parent.appendChildView(inserted);
        await initializeVisibleViewData(
            view,
            context.dataFlow,
            context.textMetrics
        );
        expect(offsets(inserted)).toEqual(offsets(summary));
        const stack = iterateDataDependencies(
            inserted.flowHandle.collector
        ).find((node) => node.label === "stack");
        expect(stack?.parent?.outputGrouping).toMatchObject({
            keys: expect.arrayContaining([["start", "end"]]),
            fileFree: true,
        });
        expect(load).not.toHaveBeenCalled();
    });

    test("joins lane positions on first load and updates both readers from the same input", async () => {
        let sourceLoads = 0;
        const { view, context } = await createHeadlessEngine(
            {
                datasets: {
                    labels: [
                        { gene: "A", lane: 0, width: 2 },
                        { gene: "B", lane: 0, width: 4 },
                        { gene: "C", lane: 1, width: 7 },
                    ],
                },
                params: [{ name: "factor", value: 1 }],
                data: { name: "labels" },
                transform: [
                    { type: "collect" },
                    {
                        type: "branch",
                        transform: [
                            {
                                type: "formula",
                                expr: "datum.width * factor",
                                as: "scaledWidth",
                            },
                            {
                                type: "aggregate",
                                groupby: ["lane"],
                                fields: ["scaledWidth"],
                                ops: ["max"],
                                as: ["laneWidth"],
                            },
                            {
                                type: "stack",
                                field: "laneWidth",
                                groupby: [],
                                sort: { field: "lane" },
                                as: ["laneStart", "laneEnd"],
                            },
                            { type: "publish", dataset: "lanePositions" },
                        ],
                    },
                    {
                        type: "lookup",
                        from: { name: "lanePositions" },
                        key: "lane",
                        values: ["laneEnd"],
                    },
                ],
                vconcat: [
                    {
                        name: "genes",
                        mark: "point",
                        encoding: {
                            x: { field: "laneEnd", type: "quantitative" },
                        },
                    },
                    {
                        name: "lanes",
                        data: { name: "lanePositions" },
                        mark: "point",
                        encoding: {
                            x: { field: "laneWidth", type: "quantitative" },
                        },
                    },
                ],
            },
            {
                contextOptions: {
                    isViewConfiguredVisible: (view) =>
                        view.explicitName !== "lanes",
                },
                onDataFlowBuilt(dataFlow) {
                    const source =
                        dataFlow.findNamedDataSource("labels").dataSource;
                    const load = source.loadSynchronously.bind(source);
                    const spy = vi
                        .spyOn(source, "loadSynchronously")
                        .mockImplementation(() => {
                            sourceLoads++;
                            load();
                        });
                    onTestFinished(() => spy.mockRestore());
                },
            }
        );
        const genes = getView(view, "genes");
        const lanes = getView(view, "lanes");
        const api = createViewMutationApi({ viewRoot: view });
        const datasets = api.root().datasets;
        const offsets = () =>
            getRows(genes).map(({ gene, laneEnd }) => [gene, laneEnd]);
        const widths = () =>
            getRows(lanes).map(({ lane, laneWidth }) => [lane, laneWidth]);

        // Startup has already streamed the primary rows while building the side table.
        expect(isDataReady(genes.flowHandle.collector)).toBe(true);
        expect(offsets()).toEqual([
            ["A", 4],
            ["B", 4],
            ["C", 11],
        ]);
        expect(lanes.getDataInitializationState()).toBe("none");
        context.isViewConfiguredVisible = () => true;
        await initializeVisibleViewData(
            view,
            context.dataFlow,
            context.textMetrics
        );
        expect(widths()).toEqual([
            [0, 4],
            [1, 7],
        ]);
        expect(sourceLoads).toBe(1);

        view.paramRuntime.setValue("factor", 2);
        await view.paramRuntime.whenPropagated();
        expect(offsets()).toEqual([
            ["A", 8],
            ["B", 8],
            ["C", 22],
        ]);
        expect(widths()).toEqual([
            [0, 8],
            [1, 14],
        ]);
        expect(sourceLoads).toBe(1);

        expect(() => datasets.set("lanePositions", [])).toThrow(/read.only/i);
        expect(() => datasets.reset("lanePositions")).toThrow(/read.only/i);
        await expect(
            datasets.load("lanePositions", new ArrayBuffer(0), {
                type: "arrow",
            })
        ).rejects.toThrow(/read.only/i);

        await api.remove(api.get({ scope: [], view: "lanes" }));
        datasets.set("labels", [{ gene: "D", lane: 0, width: 3 }]);
        await view.paramRuntime.whenPropagated();
        expect(offsets()).toEqual([["D", 6]]);
        expect(sourceLoads).toBe(2);

        const { dataSource } = context.dataFlow.findNamedDataSource("labels");
        dataSource.reset();
        dataSource.complete(false);
        await view.paramRuntime.whenPropagated();
        expect(isDataReady(genes.flowHandle.collector)).toBe(false);

        datasets.set("labels", []);
        await view.paramRuntime.whenPropagated();
        expect(offsets()).toEqual([]);
        expect(isDataReady(genes.flowHandle.collector)).toBe(true);
        expect(sourceLoads).toBe(3);

        view.disposeSubtree();
        expect(context.dataFlow.dataSources).toHaveLength(0);
        expect(context.dataFlow.collectors).toHaveLength(0);
    });

    test("publishes at its position and resolves derived names in descendants", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ value: 1 }, { value: 3 }] },
            transform: [
                {
                    type: "branch",
                    transform: [
                        { type: "filter", expr: "datum.value > 1" },
                        {
                            type: "formula",
                            expr: "datum.value * 10",
                            as: "width",
                        },
                        { type: "publish", dataset: "summary" },
                    ],
                },
                {
                    type: "lookup",
                    from: { name: "summary" },
                    key: "value",
                    values: ["width"],
                },
                {
                    type: "branch",
                    transform: [
                        {
                            type: "aggregate",
                            fields: ["width"],
                            ops: ["max"],
                            as: ["extent"],
                        },
                        {
                            type: "values",
                            field: "extent",
                            param: "panelExtent",
                        },
                    ],
                },
            ],
            vconcat: [
                {
                    data: { name: "summary" },
                    transform: [
                        {
                            type: "formula",
                            expr: "datum.value * 2",
                            as: "value",
                        },
                        { type: "publish", dataset: "doubled" },
                        {
                            type: "formula",
                            expr: "datum.value + 1",
                            as: "value",
                        },
                    ],
                    layer: [
                        { name: "main", mark: "point" },
                        {
                            name: "chained",
                            data: { name: "doubled" },
                            mark: "point",
                        },
                    ],
                },
                {
                    name: "shadow",
                    datasets: { summary: [{ value: 8 }] },
                    data: { name: "summary" },
                    mark: "point",
                },
            ],
        });
        onTestFinished(() => view.disposeSubtree());
        // Completing a pending join as empty would pass an undefined maximum to values.
        expect(view.paramRuntime.getValue("panelExtent")).toEqual([30]);
        for (const [name, value] of Object.entries({
            main: 7,
            chained: 6,
            shadow: 8,
        })) {
            const reader = getView(view, name);
            expect(getRows(reader).map((row) => row.value)).toEqual([value]);
            expect(isDataReady(reader.flowHandle.collector)).toBe(true);
        }
    });

    // Fail after attaching to a borrowed table and before attaching to a new source.
    test.each([
        {
            name: "summary",
            prefix: [
                {
                    type: /** @type {const} */ ("formula"),
                    expr: "datum.value + 1",
                    as: "shifted",
                },
            ],
        },
        { name: "input", prefix: [] },
    ])(
        "a failed reader insertion from $name leaves the published table usable",
        async ({ name, prefix }) => {
            const { view, context } = await createHeadlessEngine({
                datasets: { input: [{ value: 3 }] },
                data: { name: "input" },
                transform: [{ type: "publish", dataset: "summary" }],
                vconcat: [
                    {
                        name: "direct",
                        data: { name: "summary" },
                        mark: "point",
                    },
                ],
            });
            onTestFinished(() => view.disposeSubtree());
            const api = createViewMutationApi({ viewRoot: view });
            const owner = api.root();
            const originalSource =
                context.dataFlow.findNamedDataSource("input").dataSource;

            await expect(
                api.insert(owner, {
                    data: { name },
                    transform: [
                        ...prefix,
                        {
                            type: "lookup",
                            from: { name: "later" },
                            key: "value",
                        },
                        { type: "publish", dataset: "later" },
                    ],
                    mark: "point",
                })
            ).rejects.toThrow(/later.*earlier publish/i);

            expect(
                context.dataFlow.findNamedDataSource("input").dataSource
            ).toBe(originalSource);
            owner.datasets.set("input", [{ value: 4 }]);
            await view.paramRuntime.whenPropagated();
            expect(
                getRows(getView(view, "direct")).map((row) => row.value)
            ).toEqual([4]);
        }
    );

    test("reports a local name collision and a reference before publication", async () => {
        /** @type {import("../spec/transform.js").PublishParams} */
        const producer = {
            type: "publish",
            dataset: "summary",
        };
        await expect(
            createHeadlessEngine({
                datasets: { summary: [] },
                data: { values: [{ value: 1 }] },
                transform: [producer],
                mark: "point",
            })
        ).rejects.toThrow(/duplicate.*summary/i);
        await expect(
            createHeadlessEngine({
                data: { name: "summary" },
                transform: [producer],
                mark: "point",
            })
        ).rejects.toThrow(/summary.*earlier publish/i);
    });
});
