import { expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../view/testUtils.js";
import Collector from "../collector.js";
import { processData } from "../flowTestUtils.js";
import CrossTransform from "./cross.js";

/**
 * @param {import("../flowNode.js").Datum[]} data
 */
function collect(data) {
    const collector = new Collector({ type: "collect" });
    for (const datum of data) {
        collector.handle(datum);
    }
    collector.complete();
    return collector;
}

test("forms a flat primary-major Cartesian product", () => {
    const primary = [{ x: 1 }, { x: 2 }];
    const foreign = [{ y: "a" }, { y: "b" }, { y: "c" }];
    const cross = new CrossTransform(
        {
            type: "cross",
            from: { data: { values: [] } },
        },
        collect(foreign)
    );

    expect(processData(cross, primary)).toEqual([
        { x: 1, y: "a" },
        { x: 1, y: "b" },
        { x: 1, y: "c" },
        { x: 2, y: "a" },
        { x: 2, y: "b" },
        { x: 2, y: "c" },
    ]);
    expect(primary).toEqual([{ x: 1 }, { x: 2 }]);
    expect(foreign).toEqual([{ y: "a" }, { y: "b" }, { y: "c" }]);
});

test("produces no rows when either input is empty", () => {
    const emptyPrimary = new CrossTransform(
        {
            type: "cross",
            from: { data: { values: [] } },
        },
        collect([{ y: 1 }])
    );
    const emptyForeign = new CrossTransform(
        {
            type: "cross",
            from: { data: { values: [] } },
        },
        collect([])
    );

    expect(processData(emptyPrimary, [])).toEqual([]);
    expect(processData(emptyForeign, [{ x: 1 }])).toEqual([]);
});

test("rejects duplicate field names", () => {
    const cross = new CrossTransform(
        {
            type: "cross",
            from: { data: { values: [] } },
        },
        collect([{ shared: "foreign" }])
    );

    expect(() => processData(cross, [{ shared: "primary" }])).toThrowError(
        /Duplicate fields: \["shared"\]/
    );
});

test("rejects heterogeneous foreign fields", () => {
    const cross = new CrossTransform(
        {
            type: "cross",
            from: { data: { values: [] } },
        },
        collect([{ y: 1 }, { z: 2 }])
    );

    expect(() => processData(cross, [{ x: 1 }])).toThrowError(
        /must have homogeneous fields/
    );
});

test("requires foreign data to complete before primary data", () => {
    const cross = new CrossTransform(
        {
            type: "cross",
            from: { data: { values: [] } },
        },
        new Collector({ type: "collect" })
    );

    expect(() => processData(cross, [{ x: 1 }])).toThrowError(
        /must be loaded before primary data/
    );
});

test("repropagates buffered primary data after foreign data reloads", () => {
    const foreign = collect([{ y: "a" }]);
    const primary = new Collector({ type: "collect" });
    const cross = new CrossTransform(
        {
            type: "cross",
            from: { data: { values: [] } },
        },
        foreign
    );
    const output = new Collector({ type: "collect" });
    primary.addChild(cross);
    cross.addChild(output);

    primary.handle({ x: 1 });
    primary.complete();
    expect([...output.getData()]).toEqual([{ x: 1, y: "a" }]);

    foreign.reset();
    foreign.handle({ y: "b" });
    foreign.handle({ y: "c" });
    foreign.complete();

    expect([...output.getData()]).toEqual([
        { x: 1, y: "b" },
        { x: 1, y: "c" },
    ]);
});

test("preserves primary facet boundaries", () => {
    const cross = new CrossTransform(
        {
            type: "cross",
            from: { data: { values: [] } },
        },
        collect([{ y: "a" }, { y: "b" }])
    );
    const output = new Collector({ type: "collect" });
    cross.addChild(output);

    cross.beginBatch({ type: "facet", facetId: ["first"] });
    cross.handle({ x: 1 });
    cross.beginBatch({ type: "facet", facetId: ["second"] });
    cross.handle({ x: 2 });
    cross.complete();

    expect(Array.from(output.facetBatches.values())).toEqual([
        [],
        [
            { x: 1, y: "a" },
            { x: 1, y: "b" },
        ],
        [
            { x: 2, y: "a" },
            { x: 2, y: "b" },
        ],
    ]);
});

test("loads and preprocesses a generated foreign relation", async () => {
    const { view, context } = await createHeadlessEngine({
        data: { values: [{ x: 1 }, { x: 2 }] },
        transform: [
            {
                type: "cross",
                from: {
                    data: {
                        sequence: { start: 10, stop: 13, as: "y" },
                    },
                    transform: [
                        {
                            type: "formula",
                            expr: "datum.y * 2",
                            as: "doubled",
                        },
                    ],
                },
            },
        ],
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative" },
            y: { field: "y", type: "quantitative" },
        },
    });

    expect(
        [...view.flowHandle.collector.getData()].map(({ x, y, doubled }) => ({
            x,
            y,
            doubled,
        }))
    ).toEqual([
        { x: 1, y: 10, doubled: 20 },
        { x: 1, y: 11, doubled: 22 },
        { x: 1, y: 12, doubled: 24 },
        { x: 2, y: 10, doubled: 20 },
        { x: 2, y: 11, doubled: 22 },
        { x: 2, y: 12, doubled: 24 },
    ]);
    expect(context.dataFlow.dataSources).toHaveLength(2);

    view.disposeSubtree();
    expect(context.dataFlow.dataSources).toHaveLength(0);
    expect(context.dataFlow.collectors).toHaveLength(0);
});

test("rejects lazy foreign data and nested side-input transforms", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
        await expect(
            createHeadlessEngine({
                data: { values: [{ x: 1 }] },
                transform: [
                    {
                        type: "cross",
                        from: {
                            data: /** @type {any} */ ({
                                lazy: { type: "axisTicks", channel: "x" },
                            }),
                        },
                    },
                ],
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                },
            })
        ).rejects.toThrow(/cannot use lazy foreign data/i);

        await expect(
            createHeadlessEngine({
                data: { values: [{ x: 1 }] },
                transform: [
                    {
                        type: "cross",
                        from: {
                            data: { values: [{ y: 2 }] },
                            transform: [
                                {
                                    type: "cross",
                                    from: {
                                        data: { values: [{ z: 3 }] },
                                    },
                                },
                            ],
                        },
                    },
                ],
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                },
            })
        ).rejects.toThrow(
            /Transforms with side inputs cannot be used in a side-input transform pipeline/
        );
    } finally {
        warn.mockRestore();
    }
});
