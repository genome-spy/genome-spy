// @ts-nocheck

import { describe, expect, test, vi } from "vitest";

import { toRegularArray as r } from "../utils/domainArray.js";
import GenomeStore from "../genome/genomeStore.js";
import LayerView from "../view/layerView.js";
import UnitView from "../view/unitView.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import {
    getRequiredScaleResolution,
    getScaleDomain,
    initView,
} from "./scaleResolutionTestUtils.js";

describe("Scale resolution domain handling", () => {
    test("Scales are shared and explicit domains merged properly", async () => {
        const view = await initView(
            {
                data: { values: [] },
                resolve: { scale: { default: "independent", y: "shared" } },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                field: "a",
                                type: "quantitative",
                                scale: { domain: [1, 2] },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                field: "b",
                                type: "quantitative",
                                scale: { domain: [4, 5] },
                            },
                        },
                    },
                ],
            },
            LayerView
        );

        const d = (member) => getScaleDomain(member, "y");

        expect(r(d(view))).toEqual([1, 5]);
        expect(r(d(view.children[0]))).toEqual([1, 5]);
        expect(r(d(view.children[1]))).toEqual([1, 5]);
    });

    test("Configured domains can be defined by expressions and update reactively", async () => {
        const view = await initView(
            {
                data: { values: [] },
                params: [{ name: "upperBound", value: 2 }],
                resolve: { scale: { default: "independent", y: "shared" } },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                field: "a",
                                type: "quantitative",
                                scale: {
                                    domain: {
                                        expr: "[0, upperBound]",
                                    },
                                },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                field: "b",
                                type: "quantitative",
                                scale: {
                                    domain: [4, 5],
                                },
                            },
                        },
                    },
                ],
            },
            LayerView
        );

        const firstChild = view.children[0];
        const resolution = getRequiredScaleResolution(view, "y");

        expect(r(resolution.getDomain())).toEqual([0, 5]);

        // Non-obvious: the child expression reads the root param through the
        // shared view scope, so updating the root must refresh the shared scale.
        view.paramRuntime.setValue("upperBound", 6);
        await view.paramRuntime.whenPropagated();

        expect(r(resolution.getDomain())).toEqual([0, 6]);
        expect(r(getScaleDomain(firstChild, "y"))).toEqual([0, 6]);
    });

    test("Scale expressions can reference sibling scale domains regardless of encoding order", async () => {
        const view = await initView(
            {
                data: {
                    values: [
                        { x: -8, y: -2 },
                        { x: 8, y: 2 },
                    ],
                },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: {
                            domain: {
                                expr: "domain('y')",
                            },
                        },
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: { zoom: true },
                    },
                },
            },
            UnitView
        );

        const xResolution = getRequiredScaleResolution(view, "x");
        const yResolution = getRequiredScaleResolution(view, "y");

        expect(r(xResolution.getDomain())).toEqual(r(yResolution.getDomain()));

        yResolution.getScale().domain([-4, 4]);
        await view.paramRuntime.whenPropagated();

        expect(r(xResolution.getDomain())).toEqual([-4, 4]);
    });

    test("zoomLevel is available while scale domains are compiled", async () => {
        const view = await initView(
            {
                data: { values: [{ y: 1 }] },
                mark: "point",
                encoding: {
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: {
                            domain: {
                                expr: "[10 / zoomLevel, 50]",
                            },
                        },
                    },
                },
            },
            UnitView
        );

        expect(r(getRequiredScaleResolution(view, "y").getDomain())).toEqual([
            10, 50,
        ]);
    });

    test("zoomLevel reacts to scale zoom changes", async () => {
        const view = await initView(
            {
                data: {
                    values: [
                        { x: 0, y: 1 },
                        { x: 10, y: 2 },
                    ],
                },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { zoom: true },
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                    },
                },
            },
            UnitView
        );

        const resolution = getRequiredScaleResolution(view, "x");
        const zoomLevel = view.paramRuntime.createExpression("zoomLevel");

        expect(zoomLevel()).toBe(1);

        resolution.getScale().domain([2, 6]);
        await view.paramRuntime.whenPropagated();

        expect(zoomLevel()).toBeGreaterThan(1);
    });

    test("Scale domain cycles fail fast", async () => {
        await expect(
            initView(
                {
                    data: { values: [] },
                    mark: "point",
                    encoding: {
                        x: {
                            field: "a",
                            type: "quantitative",
                            scale: {
                                domain: {
                                    expr: "domain('x')",
                                },
                            },
                        },
                    },
                },
                UnitView
            )
        ).rejects.toThrow(
            /Scale helper cycle detected while evaluating domain\("x"\)\./
        );
    });

    test("Scales are shared and extracted domains merged properly", async () => {
        const view = await initView(
            {
                resolve: { scale: { default: "independent", y: "shared" } },
                layer: [
                    {
                        data: { values: [1, 2] },
                        mark: "point",
                        encoding: {
                            y: {
                                field: "data",
                                type: "quantitative",
                                scale: { zero: false },
                            },
                        },
                    },
                    {
                        data: { values: [4, 5] },
                        mark: "point",
                        encoding: {
                            y: { field: "data", type: "quantitative" },
                        },
                    },
                ],
            },
            LayerView
        );

        const d = (member) => getScaleDomain(member, "y");

        expect(r(d(view))).toEqual([1, 5]);
        expect(r(d(view.children[0]))).toEqual([1, 5]);
        expect(r(d(view.children[1]))).toEqual([1, 5]);
    });

    test("index scales inferred from data include the last observed index", async () => {
        const view = await initView(
            {
                data: { values: [3, 4, 8, 9] },
                mark: "point",
                encoding: {
                    x: { field: "data", type: "index" },
                },
            },
            UnitView
        );

        expect(r(getScaleDomain(view, "x"))).toEqual([3, 10]);
        expect(
            r(getRequiredScaleResolution(view, "x").getComplexDomain())
        ).toEqual([3, 9]);

        await getRequiredScaleResolution(view, "x").zoomTo([4, 8]);

        expect(r(getScaleDomain(view, "x"))).toEqual([4, 9]);
        expect(
            r(getRequiredScaleResolution(view, "x").getComplexDomain())
        ).toEqual([4, 8]);
    });

    test("explicit locus domains use inclusive end positions and keep the genome extent intact", async () => {
        const genomeStore = new GenomeStore(".");
        await genomeStore.initialize({
            name: "test",
            contigs: [{ name: "chr1", size: 50 }],
        });

        const { view } = await createHeadlessEngine(
            {
                data: {
                    values: [{ chrom: "chr1", pos: 5 }],
                },
                mark: "point",
                encoding: {
                    x: {
                        chrom: "chrom",
                        pos: "pos",
                        type: "locus",
                        scale: {
                            domain: [
                                { chrom: "chr1", pos: 3 },
                                { chrom: "chr1", pos: 9 },
                            ],
                        },
                    },
                },
            },
            {
                contextOptions: {
                    genomeStore,
                },
            }
        );

        const resolution = getRequiredScaleResolution(view, "x");

        expect(r(resolution.getDomain())).toEqual([3, 10]);
        expect(resolution.getComplexDomain()).toEqual([
            { chrom: "chr1", pos: 3 },
            { chrom: "chr1", pos: 9 },
        ]);
        expect(resolution.getScale().genome().getExtent()).toEqual([0, 50]);
    });

    test("shared collectors de-duplicate domain extraction for conditional encodings", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: {
                values: [{ a: 1 }, { a: 2 }],
            },
            resolve: {
                scale: { x: "shared" },
            },
            layer: [
                {
                    mark: "point",
                    encoding: {
                        x: {
                            field: "a",
                            type: "quantitative",
                            condition: { value: 0 },
                        },
                    },
                },
                {
                    mark: "point",
                    encoding: {
                        x: {
                            field: "a",
                            type: "quantitative",
                            condition: { value: 0 },
                        },
                    },
                },
            ],
        };

        const view = await initView(spec, LayerView);
        const [left, right] = view.children;
        const collector = left.getCollector();
        if (!collector) {
            throw new Error("Missing collector for shared collector test.");
        }

        if (collector !== right.getCollector()) {
            if (!right.flowHandle) {
                throw new Error(
                    "Missing flow handle for shared collector test."
                );
            }
            // Non-obvious: simulate a shared collector for merged dataflow.
            right.flowHandle.collector = collector;
        }

        const resolution = getRequiredScaleResolution(left, "x");

        // Non-obvious: conditional values still exercise the conditional path.
        const spy = vi.spyOn(collector, "getDomain");

        resolution.reconfigureDomain();

        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    test("Scales of primary and secondary channels are shared and extracted domains merged properly", async () => {
        const view = await initView(
            {
                data: {
                    values: [
                        { a: 1, b: 4 },
                        { a: 2, b: 5 },
                    ],
                },
                mark: "rect",
                encoding: {
                    x: { value: 0 },
                    x2: { value: 1 },
                    y: {
                        field: "a",
                        type: "quantitative",
                        scale: { zero: false },
                    },
                    y2: {
                        field: "b",
                    },
                },
            },
            UnitView
        );

        expect(r(getScaleDomain(view, "y"))).toEqual([1, 5]);
    });

    test("resolutionChannel property is respected", async () => {
        const view = await initView(
            {
                data: { values: [] },
                resolve: { scale: { default: "independent", y: "shared" } },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            y: {
                                field: "a",
                                type: "quantitative",
                                scale: { domain: [1, 2] },
                            },
                        },
                    },
                    {
                        mark: "point",
                        encoding: {
                            x: {
                                field: "b",
                                type: "quantitative",
                                scale: { domain: [4, 5] },
                                resolutionChannel: "y",
                            },
                        },
                    },
                ],
            },
            LayerView
        );

        const d = (member) => getScaleDomain(member, "y");

        expect(r(d(view))).toEqual([1, 5]);
        expect(r(d(view.children[0]))).toEqual([1, 5]);
        expect(r(d(view.children[1]))).toEqual([1, 5]);
    });

    test.each([
        {
            name: "Channels with quantitative fields include zero in their scale domain by default",
            scale: undefined,
            expected: [0, 3],
        },
        {
            name: "Channels with quantitative fields do not include zero in their scale domain if the domain has been defined explicitly",
            scale: { domain: [1, 4] },
            expected: [1, 4],
        },
        {
            name: "Channels with quantitative fields do not include zero in their scale domain if zero is explicitly false",
            scale: { zero: false },
            expected: [2, 3],
        },
    ])("$name", async ({ scale, expected }) => {
        const view = await initView(
            {
                data: { values: [2, 3] },
                mark: "point",
                encoding: {
                    x: {
                        field: "data",
                        type: "quantitative",
                        ...(scale && { scale }),
                    },
                    y: {
                        field: "data",
                        type: "quantitative",
                        ...(scale && { scale }),
                    },
                },
            },
            UnitView
        );

        expect(getScaleDomain(view, "x")).toEqual(expected);
        expect(getScaleDomain(view, "y")).toEqual(expected);
    });

    test("reconfigureDomain notifies when a non-zoomable domain changes", async () => {
        const view = await initView(
            {
                data: { values: ["a", "b"] },
                mark: "point",
                encoding: {
                    color: { field: "data", type: "nominal" },
                },
            },
            UnitView
        );

        const resolution = getRequiredScaleResolution(view, "color");
        const notify = vi.fn();
        resolution.addEventListener("domain", notify);

        // Non-obvious: force a domain change on a non-zoomable scale.
        resolution.getScale().domain(["z"]);
        resolution.reconfigureDomain();

        expect(notify).toHaveBeenCalled();
        expect(resolution.scale.domain()).toEqual(["a", "b"]);
    });

    test("reconfigureDomain does not notify when the domain is unchanged", async () => {
        const view = await initView(
            {
                data: { values: ["a", "b"] },
                mark: "point",
                encoding: {
                    color: { field: "data", type: "nominal" },
                },
            },
            UnitView
        );

        const resolution = getRequiredScaleResolution(view, "color");
        const notify = vi.fn();
        resolution.addEventListener("domain", notify);

        resolution.reconfigureDomain();

        expect(notify).not.toHaveBeenCalled();
        expect(resolution.scale.domain()).toEqual(["a", "b"]);
    });

    test("reconfigureDomain skips notifications when nice keeps the domain stable", async () => {
        const view = await initView(
            {
                data: { values: [1.2, 9.7] },
                mark: "point",
                encoding: {
                    x: {
                        field: "data",
                        type: "quantitative",
                        scale: { nice: true },
                    },
                },
            },
            UnitView
        );

        const resolution = getRequiredScaleResolution(view, "x");
        const notify = vi.fn();
        const initialDomain = resolution.scale.domain();

        resolution.addEventListener("domain", notify);
        resolution.reconfigureDomain();

        expect(notify).not.toHaveBeenCalled();
        expect(resolution.scale.domain()).toEqual(initialDomain);
    });

    test("reconfigureDomain preserves zoomed domains for zoomable scales", async () => {
        const view = await initView(
            {
                data: { values: [2, 3, 4] },
                mark: "point",
                encoding: {
                    x: {
                        field: "data",
                        type: "quantitative",
                        scale: { zoom: true },
                    },
                },
            },
            UnitView
        );

        const resolution = getRequiredScaleResolution(view, "x");
        // Non-obvious: simulate a zoomed domain so the reconfigure path must preserve it.
        resolution.getScale().domain([2, 3]);

        resolution.reconfigureDomain();

        expect(resolution.scale.domain()).toEqual([2, 3]);
    });

    test("reconfigureDomain skips zoom animation before first render", async () => {
        const view = await initView(
            {
                data: { values: [2, 3] },
                mark: "point",
                encoding: {
                    x: { field: "data", type: "quantitative" },
                },
            },
            UnitView
        );

        const resolution = getRequiredScaleResolution(view, "x");
        const spy = vi.spyOn(resolution, "zoomTo");

        // Non-obvious: set a different domain to force a reconfigure change.
        resolution.getScale().domain([0, 1]);
        resolution.reconfigureDomain();

        expect(spy).not.toHaveBeenCalled();
        expect(resolution.scale.domain()).toEqual([0, 3]);
        spy.mockRestore();
    });

    test("reconfigureDomain animates after a view has rendered once", async () => {
        const view = await initView(
            {
                data: { values: [2, 3] },
                mark: "point",
                encoding: {
                    x: { field: "data", type: "quantitative" },
                },
            },
            UnitView
        );

        const resolution = getRequiredScaleResolution(view, "x");
        const spy = vi.spyOn(resolution, "zoomTo");

        // Non-obvious: simulate the first render to allow transitions.
        view.onBeforeRender();
        resolution.getScale().domain([0, 1]);
        resolution.reconfigureDomain();

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    test("categorical indexers preserve stable ordering across domain refreshes", async () => {
        const view = await initView(
            {
                data: { values: [{ data: "a" }, { data: "b" }] },
                mark: "point",
                encoding: {
                    color: { field: "data", type: "nominal" },
                },
            },
            UnitView
        );

        const resolution = getRequiredScaleResolution(view, "color");
        const scale = resolution.getScale();
        const indexer = scale.props.domainIndexer;

        // Non-obvious: reorder collector data so the extracted domain order changes.
        const collector = view.getCollector();
        const data = collector.facetBatches.get(undefined);
        if (!data) {
            throw new Error("Missing collector data for categorical test.");
        }
        data.length = 0;
        data.push({ data: "b" }, { data: "a" }, { data: "c" });

        const firstA = indexer("a");
        const firstB = indexer("b");

        collector.repropagate();
        resolution.reconfigureDomain();

        expect(indexer("a")).toEqual(firstA);
        expect(indexer("b")).toEqual(firstB);
        expect(indexer("c")).toEqual(2);
        expect(scale.domain()).toEqual(["a", "b", "c"]);
    });

    test("explicit categorical domains define the indexer order", async () => {
        const view = await initView(
            {
                data: { values: [{ data: "b" }, { data: "a" }, { data: "c" }] },
                mark: "point",
                encoding: {
                    color: {
                        field: "data",
                        type: "nominal",
                        scale: { domain: ["a", "b", "c"] },
                    },
                },
            },
            UnitView
        );

        const scale = getRequiredScaleResolution(view, "color").getScale();
        const indexer = scale.props.domainIndexer;

        // Explicit domains should dictate the categorical index order.
        expect(indexer("a")).toEqual(0);
        expect(indexer("b")).toEqual(1);
        expect(indexer("c")).toEqual(2);
        expect(scale.domain()).toEqual(["a", "b", "c"]);
    });
});
