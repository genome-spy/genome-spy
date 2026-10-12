import { afterEach, describe, expect, it, vi } from "vitest";
import { createAndInitialize } from "../view/testUtils.js";
import SingleAxisLazySource from "../data/sources/lazy/singleAxisLazySource.js";
import UnitView from "../view/unitView.js";
import { getRegionProjection, restoreRegionScale } from "./regionProjection.js";

/** @type {UnitView[]} */
const views = [];
afterEach(() => {
    for (const view of views.splice(0)) view.disposeSubtree();
});

/** @param {Partial<import("../spec/view.js").UnitSpec>} [overrides] */
async function makeView(overrides = {}) {
    const view = await createAndInitialize(
        {
            name: "points",
            data: { values: [{ x: 1, y: 1 }] },
            mark: { type: "point", tooltip: null },
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
            ...overrides,
        },
        UnitView
    );
    views.push(view);
    return view;
}

describe("region projection", () => {
    it("derives fields and stable producer addressing, including an empty ready population", async () => {
        const view = await makeView({ data: { values: [] } });
        expect(getRegionProjection(view)).toMatchObject({
            fields: { x: "x", y: "y" },
            producer: { scope: [], view: "points" },
        });
    });

    it("captures nonlinear scales", async () => {
        const view = await makeView({
            encoding: {
                x: { field: "x", type: "quantitative", scale: { type: "log" } },
                y: { field: "y", type: "quantitative" },
            },
        });
        expect(getRegionProjection(view).scales.x.type).toBe("log");
    });

    it("rejects expression projections", async () => {
        const view = await makeView({
            encoding: {
                x: { expr: "datum.x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        });
        expect(() => getRegionProjection(view)).toThrow(
            "unconditional quantitative x field"
        );
    });

    it.each(["xOffset", "yOffset", "dx", "dy"])(
        "rejects %s supplied as a mark property",
        async (offset) => {
            const view = await makeView({
                mark: { type: "point", [offset]: 10 },
            });
            expect(() => getRegionProjection(view)).toThrow("offsets");
        }
    );

    it("rejects offsets supplied through encoding", async () => {
        const view = await makeView({
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
                xOffset: { value: 10 },
            },
        });
        expect(() => getRegionProjection(view)).toThrow("offsets");
    });

    it("rejects a ready lazy window as an incomplete population", async () => {
        const view = await makeView();
        const lazy = new SingleAxisLazySource(view, "x");
        // Publication readiness does not guarantee that every cell is loaded.
        vi.spyOn(lazy, "isDataReady").mockReturnValue(true);
        const collector = view.getCollector();
        const parent = collector.parent;
        collector.parent = lazy;
        try {
            expect(() => getRegionProjection(view)).toThrow(
                "complete, eager population"
            );
        } finally {
            collector.parent = parent;
            lazy.dispose();
        }
    });

    it("requires ready data and a named point producer", async () => {
        const pending = await makeView();
        pending.getCollector().reset();
        expect(() => getRegionProjection(pending)).toThrow(
            "ready producer data"
        );
        const rect = await makeView({ mark: "rect" });
        expect(() => getRegionProjection(rect)).toThrow("point mark");
        const unnamed = await makeView({ name: undefined });
        expect(() => getRegionProjection(unnamed)).toThrow("without a name");
    });
});

describe("resolved scale capture", () => {
    it.each(
        /** @type {import("../spec/scale.js").Scale[]} */ ([
            { type: "linear", clamp: true },
            { type: "log", base: 2 },
            { type: "sqrt" },
            { type: "pow", exponent: 3 },
            { type: "symlog", constant: 2 },
        ])
    )(
        "restores $type with actual domain/range and parameters",
        async (options) => {
            const view = await makeView({
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: {
                            ...options,
                            domain: [1, 100],
                            zero: false,
                            reverse: true,
                        },
                    },
                    y: { field: "y", type: "quantitative" },
                },
            });
            const live = view.getScaleResolution("x").getScale();
            const mapping = getRegionProjection(view).scales.x;
            expect(mapping.type).toBe(options.type);
            const restored = restoreRegionScale(
                JSON.parse(JSON.stringify(mapping))
            );
            for (const value of [1, 2, 10, 36, 100, 200])
                expect(restored(value)).toBeCloseTo(live(value), 12);
            // Navigation changes the live scale, never the captured query.
            live.domain([2, 200]);
            expect(restored(1)).toBeCloseTo(1);
            expect(mapping.domain).toEqual([1, 100]);
        }
    );
});
