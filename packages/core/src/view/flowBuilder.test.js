import { expect, test } from "vitest";
import { buildDataFlow, linearizeLocusAccess } from "./flowBuilder.js";
import { create } from "./testUtils.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import LayerView from "./layerView.js";
import UnitView from "./unitView.js";

/** @type {import("../spec/mark.js").MarkProps} */
const mark = {
    type: "rect",
    tooltip: null,
};

/**
 * @template {UnitView | LayerView} V
 * @param {import("../spec/view.js").UnitSpec | import("../spec/view.js").LayerSpec} spec
 * @param {{new (...args: any[]): V}} ViewClass
 */
async function getUnitCollector(spec, ViewClass) {
    const root = await create(spec, ViewClass);
    buildDataFlow(root);
    const unit = root.getDescendants().find((view) => view instanceof UnitView);
    return unit.getCollector();
}

test.each([
    ["default", undefined, { field: "x" }],
    ["explicit false", false, null],
])("Collector x sorting honors %s buildIndex", async (_name, value, sort) => {
    const x = {
        field: "x",
        type: /** @type {const} */ ("quantitative"),
        scale: { zoom: true },
        ...(value === undefined ? {} : { buildIndex: value }),
    };
    const collector = await getUnitCollector(
        {
            data: { values: [{ x: 2 }, { x: 1 }] },
            mark,
            encoding: { x },
        },
        UnitView
    );

    expect(collector.params.sort).toEqual(sort);
});

test("Collector sorting uses normalized inherited locus encoding", async () => {
    const collector = await getUnitCollector(
        {
            data: { values: [{ chrom: "chr1", pos: 2 }] },
            encoding: {
                x: {
                    chrom: "chrom",
                    pos: "pos",
                    type: "locus",
                },
            },
            layer: [{ mark }],
        },
        LayerView
    );

    expect(collector.params.sort).toEqual({
        field: "_linearized_chrom_pos",
    });
});

test("a unit receives transformed rows", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [3.141] },
        transform: [{ type: "formula", expr: "datum.data * 2", as: "x" }],
        mark,
    });

    expect(Array.from(view.flowHandle.collector.getData())).toEqual([
        { data: 3.141, x: 6.282 },
    ]);
});

test("a modifying branch does not change sibling rows", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [3, 5] },
        layer: [
            {
                transform: [
                    { type: "formula", expr: "datum.data * 2", as: "x" },
                ],
                mark,
            },
            {
                transform: [{ type: "filter", expr: "datum.data > 4" }],
                mark,
            },
        ],
    });

    const units = Array.from(view.getDescendants()).filter(
        (child) => child instanceof UnitView
    );
    expect(
        units.map((unit) => Array.from(unit.flowHandle.collector.getData()))
    ).toEqual([
        [
            { data: 3, x: 6 },
            { data: 5, x: 10 },
        ],
        [{ data: 5 }],
    ]);
});

test("a nested source overrides inherited data without changing its sibling", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [1] },
        transform: [{ type: "filter", expr: "datum.data > 0" }],
        layer: [
            {
                data: { sequence: { start: 0, stop: 5 } },
                transform: [{ type: "formula", expr: "3", as: "foo" }],
                mark,
            },
            { mark },
        ],
    });

    const units = Array.from(view.getDescendants()).filter(
        (child) => child instanceof UnitView
    );
    expect(Array.from(units[0].flowHandle.collector.getData())).toEqual(
        Array.from({ length: 5 }, (_, data) => ({ data, foo: 3 }))
    );
    expect(Array.from(units[1].flowHandle.collector.getData())).toEqual([
        { data: 1 },
    ]);
});

test("Linearize does not rewrite synthesized secondary locus channels", async () => {
    const root = await create(
        {
            data: {
                values: [{ chrom: "chr1", pos: 10 }],
            },
            encoding: {
                x: { chrom: "chrom", pos: "pos", type: "locus" },
            },
            layer: [
                {
                    mark: "rect",
                },
            ],
        },
        LayerView
    );

    const unit = root.getDescendants().find((view) => view instanceof UnitView);
    const linearize = unit && linearizeLocusAccess(unit);

    expect(linearize).toBeDefined();
    linearize?.rewrite();

    // x2 is synthesized by mark encoding and should not be materialized in the spec.
    expect(unit?.spec.encoding?.x2).toBeUndefined();
    expect(unit?.spec.encoding?.x).toMatchObject({
        field: "_linearized_chrom_pos",
        type: "locus",
    });
});
