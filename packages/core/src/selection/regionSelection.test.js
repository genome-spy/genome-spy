import { describe, expect, it } from "vitest";
import Collector from "../data/collector.js";
import FilterTransform from "../data/transforms/filter.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import { createSelectionPredicate } from "../encoder/encoder.js";
import { createAndInitialize } from "../view/testUtils.js";
import ConcatView from "../view/concatView.js";
import UnitView from "../view/unitView.js";
import { normalizeOrderDefinition } from "./order.js";
import {
    asSelectionConfig,
    createMultiPointSelection,
    isSelectionActive,
    normalizeSelectionPredicate,
} from "./selection.js";
import {
    createPendingRegionSelection,
    createRegionSelection,
    materializeRegionSelection,
} from "./regionSelection.js";

/** @type {import("../types/selectionTypes.js").RegionSelectionIntent} */
const intent = {
    polygon: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
    ],
    fields: { x: "position.x", y: "position.y" },
    scales: {
        x: { type: "linear", domain: [0, 1], range: [0, 1], clamp: false },
        y: { type: "linear", domain: [0, 1], range: [0, 1], clamp: false },
    },
    producer: { scope: ["plots"], view: "first" },
};

it("accepts density preview and rejects unknown region preview modes", () => {
    expect(
        asSelectionConfig({ type: "region", preview: "density" })
    ).toMatchObject({ preview: "density" });
    expect(() =>
        asSelectionConfig(
            /** @type {any} */ ({ type: "region", preview: "other" })
        )
    ).toThrow("Unsupported region preview");
});

const rows = [
    { __uniqueId: 1, position: { x: 2, y: 2 } },
    { __uniqueId: 2, position: { x: 8, y: 2 } },
    { __uniqueId: 3, position: { x: 0, y: 3 } },
    { __uniqueId: 4, position: { x: NaN, y: 2 } },
];

describe("region selection reference", () => {
    it("reuses ancestor-assigned IDs across differently projected and filtered dataflow branches", async () => {
        // An ancestor identifier is essential: default per-unit IDs do not link plots.
        const root = await createAndInitialize(
            {
                data: {
                    values: [
                        { x: 1, y: 1, otherX: 100, otherY: -100 },
                        { x: 2, y: 2, otherX: -100, otherY: 100 },
                        { x: 8, y: 2, otherX: 0, otherY: 0 },
                    ],
                },
                transform: [{ type: "identifier" }],
                hconcat: [
                    {
                        name: "first",
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                        },
                    },
                    {
                        name: "second",
                        transform: [{ type: "filter", expr: "datum.x > 1" }],
                        mark: "point",
                        encoding: {
                            x: { field: "otherX", type: "quantitative" },
                            y: { field: "otherY", type: "quantitative" },
                        },
                    },
                ],
            },
            ConcatView
        );
        const units = root
            .getDescendants()
            .filter((view) => view instanceof UnitView);
        const producer = units.find((view) => view.spec.name === "first");
        const consumer = units.find((view) => view.spec.name === "second");
        const selected = materializeRegionSelection(
            createPendingRegionSelection({
                ...intent,
                fields: { x: "x", y: "y" },
            }),
            producer.getCollector().getData()
        );
        const consumerRows = Array.from(consumer.getCollector().getData());
        expect(
            consumerRows.map((row) => selected.data.has(row.__uniqueId))
        ).toEqual([true, false]);
        root.disposeSubtree();
    });

    it("materializes a captured polygon without changing pending or previous membership", () => {
        const pending = createPendingRegionSelection(intent);
        const ready = materializeRegionSelection(pending, rows.values());

        expect(Array.from(ready.data.keys())).toEqual([1, 3]);
        expect(ready.data.get(1)).toBe(rows[0]);
        expect(pending.data.size).toBe(0);
        expect(pending.status).toBe("pending");

        const replaced = materializeRegionSelection(ready, [rows[1]]);
        expect(replaced.data.size).toBe(0);
        expect(Array.from(ready.data.keys())).toEqual([1, 3]);
        expect(isSelectionActive(replaced)).toBe(true);
    });

    it("captures intent without retaining caller-owned arrays or addressing metadata", () => {
        const original = {
            ...structuredClone(intent),
            polygon: intent.polygon.map(
                ([x, y]) => /** @type {[number, number]} */ ([x, y])
            ),
        };
        const pending = createPendingRegionSelection(original);
        original.polygon[0][0] = 100;
        original.polygon = [];
        original.fields.x = "missing";
        original.producer.scope.push("changed");
        original.producer.view = "changed";

        expect(pending.intent).toEqual(intent);
        expect(
            Array.from(materializeRegionSelection(pending, rows).data.keys())
        ).toEqual([1, 3]);
    });

    it("rejects missing, reserved, and duplicate selected IDs", () => {
        const pending = createPendingRegionSelection(intent);
        for (const id of [undefined, 0, -1, 0x100000000, 1.5]) {
            expect(() =>
                materializeRegionSelection(pending, [
                    { ...rows[0], __uniqueId: id },
                ])
            ).toThrow(/point IDs/);
        }
        expect(() =>
            materializeRegionSelection(pending, [rows[0], { ...rows[0] }])
        ).toThrow(/unique point IDs/);
        expect(() =>
            materializeRegionSelection(createRegionSelection(), rows)
        ).toThrow(/cleared/);
    });

    it.each([false, true])(
        "keeps compiled predicates correct across clear, pending, ready, and zero matches (empty=%s)",
        (empty) => {
            const runtime = new ViewParamRuntime();
            runtime.registerParam({
                name: "lasso",
                value: createRegionSelection(),
            });
            const predicate = createSelectionPredicate(
                normalizeSelectionPredicate({ param: "lasso", empty }),
                {},
                runtime
            );

            expect(predicate(rows[0])).toBe(empty);
            const pending = createPendingRegionSelection(intent);
            runtime.setValue("lasso", pending);
            expect(predicate(rows[0])).toBe(false);
            expect(isSelectionActive(pending)).toBe(true);

            runtime.setValue(
                "lasso",
                materializeRegionSelection(pending, rows)
            );
            // A linked projection uses the shared ID, not its own x/y coordinates.
            expect(
                predicate({ __uniqueId: 1, otherX: 100, otherY: -100 })
            ).toBe(true);
            expect(predicate(rows[1])).toBe(false);

            runtime.setValue("lasso", materializeRegionSelection(pending, []));
            expect(predicate(rows[0])).toBe(false);
            runtime.setValue("lasso", createRegionSelection());
            expect(predicate(rows[0])).toBe(empty);
            expect(isSelectionActive(runtime.getValue("lasso"))).toBe(false);
            runtime.dispose();
        }
    );

    it("keeps ready siblings in a union while a polygon is pending or has zero matches", () => {
        const runtime = new ViewParamRuntime();
        runtime.registerParam({
            name: "lasso",
            value: createRegionSelection(),
        });
        runtime.registerParam({
            name: "picked",
            value: createMultiPointSelection(),
        });
        const predicate = createSelectionPredicate(
            normalizeSelectionPredicate({
                test: {
                    param: {
                        or: /** @type {[string, ...string[]]} */ ([
                            "lasso",
                            "picked",
                        ]),
                    },
                    empty: true,
                },
            }),
            {},
            runtime
        );
        expect(predicate(rows[1])).toBe(true);

        const pending = createPendingRegionSelection(intent);
        runtime.setValue("lasso", pending);
        expect(predicate(rows[1])).toBe(false);
        runtime.setValue("picked", createMultiPointSelection([rows[1]]));
        expect(predicate(rows[1])).toBe(true);
        expect(predicate(rows[0])).toBe(false);

        runtime.setValue("lasso", materializeRegionSelection(pending, []));
        expect(predicate(rows[1])).toBe(true);
        expect(predicate(rows[0])).toBe(false);
        runtime.dispose();
    });

    it("treats pending and zero-match regions as active for conditional ordering", () => {
        const runtime = new ViewParamRuntime();
        runtime.registerParam({
            name: "lasso",
            value: createRegionSelection(),
        });
        const order = normalizeOrderDefinition(
            { condition: { param: "lasso", empty: true, value: 1 }, value: 0 },
            {},
            runtime,
            "intersects"
        );
        expect(order.isActive()).toBe(false);
        const pending = createPendingRegionSelection(intent);
        runtime.setValue("lasso", pending);
        expect(order.isActive()).toBe(true);
        expect(order.predicate(rows[0])).toBe(false);
        runtime.setValue("lasso", materializeRegionSelection(pending, []));
        expect(order.isActive()).toBe(true);
        expect(order.predicate(rows[0])).toBe(false);
        runtime.dispose();
    });

    it("repropagates downstream filters when membership becomes ready or cleared", () => {
        const runtime = new ViewParamRuntime();
        runtime.registerParam({
            name: "lasso",
            value: createRegionSelection(),
        });
        const source = new Collector();
        const filter = new FilterTransform(
            { type: "filter", param: "lasso", empty: true },
            { paramRuntime: runtime }
        );
        const output = new Collector();
        source.addChild(filter);
        filter.addChild(output);
        filter.initialize();
        for (const row of rows) source.handle(row);
        source.complete();
        expect(output.getData()).toEqual(rows);

        const pending = createPendingRegionSelection(intent);
        runtime.setValue("lasso", pending);
        expect(output.getData()).toEqual([]);
        runtime.setValue("lasso", materializeRegionSelection(pending, rows));
        expect(output.getData()).toEqual([rows[0], rows[2]]);
        runtime.setValue("lasso", materializeRegionSelection(pending, []));
        expect(output.getData()).toEqual([]);
        runtime.setValue("lasso", createRegionSelection());
        expect(output.getData()).toEqual(rows);

        filter.dispose();
        runtime.dispose();
    });
});

describe("captured nonlinear projection", () => {
    it("tests a slanted edge in projected space rather than inverse-vertex space", () => {
        const pending = createPendingRegionSelection({
            ...intent,
            fields: { x: "x", y: "y" },
            polygon: [
                [0, 0],
                [1, 0],
                [0, 1],
            ],
            scales: {
                x: {
                    type: "log",
                    domain: [1, 100],
                    range: [0, 1],
                    clamp: false,
                    base: 10,
                },
                y: {
                    type: "sqrt",
                    domain: [0, 100],
                    range: [0, 1],
                    clamp: false,
                    exponent: 0.5,
                },
            },
        });
        // (10,36) is outside in projected space (.5,.6), inside the inverse triangle.
        const data = [
            { __uniqueId: 1, x: 10, y: 36 },
            { __uniqueId: 2, x: 10, y: 16 },
            { __uniqueId: 3, x: 10, y: 25 },
            { __uniqueId: 4, x: -10, y: 16 },
            { __uniqueId: 5, x: 0, y: 16 },
            { __uniqueId: 6, x: NaN, y: 16 },
        ];
        expect(
            Array.from(materializeRegionSelection(pending, data).data.keys())
        ).toEqual([2, 3]);
        const replay = createPendingRegionSelection(
            JSON.parse(JSON.stringify(pending.intent))
        );
        expect(
            Array.from(materializeRegionSelection(replay, data).data.keys())
        ).toEqual([2, 3]);
    });

    it("owns captured domains/ranges independently of caller mutation", () => {
        const original = structuredClone(intent);
        const pending = createPendingRegionSelection(original);
        original.scales.x.domain[1] = 100;
        original.scales.y.range.reverse();
        expect(pending.intent.scales).toEqual(intent.scales);
        expect(
            Array.from(materializeRegionSelection(pending, rows).data.keys())
        ).toEqual([1, 3]);
    });

    it("rejects corrupt captured mappings before materialization", () => {
        const invalid = structuredClone(intent);
        invalid.scales.x.domain[0] = NaN;
        expect(() => createPendingRegionSelection(invalid)).toThrow(
            "Invalid captured"
        );
    });
});
