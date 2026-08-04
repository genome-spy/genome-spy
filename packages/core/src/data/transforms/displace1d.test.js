import { describe, expect, test, vi } from "vitest";
import Rectangle from "../../view/layout/rectangle.js";
import { createAndInitialize, renderToLayout } from "../../view/testUtils.js";
import UnitView from "../../view/unitView.js";
import Collector from "../collector.js";
import Displace1DTransform from "./displace1d.js";

/**
 * @param {{ pos: number, length?: number }[]} data
 * @param {number | string} length
 * @param {number} [positionFactor]
 */
function createFlow(data, length, positionFactor = 100) {
    const source = new Collector();
    const transform = new Displace1DTransform(
        {
            type: "displace1d",
            pos: "pos",
            length,
            positionFactor,
            as: "offset",
        },
        /** @type {any} */ ({})
    );
    const output = new Collector();
    source.addChild(transform);
    transform.addChild(output);

    for (const datum of data) {
        source.handle(datum);
    }
    source.complete();

    return { output, source, transform };
}

describe("Displace1DTransform", () => {
    test("uses one and displacement as grammar defaults", () => {
        const transform = new Displace1DTransform(
            { type: "displace1d", pos: "pos", length: 10 },
            /** @type {any} */ ({})
        );
        const output = new Collector();
        transform.addChild(output);
        transform.handle({ pos: 0 });
        transform.complete();

        expect(transform.positionFactor).toBe(1);
        expect([...output.getData()]).toEqual([{ pos: 0, displacement: 0 }]);
    });

    test("reacts through a sorted collector without affecting a data-driven domain", async () => {
        /** @type {import("../../spec/view.js").UnitSpec} */
        const spec = {
            width: 200,
            height: 100,
            data: { values: [{ pos: 100 }, { pos: 11 }, { pos: 10 }] },
            transform: [
                {
                    type: "collect",
                    sort: { field: "pos", order: "ascending" },
                },
                {
                    type: "displace1d",
                    pos: "pos",
                    length: 20,
                    positionFactor: {
                        expr: "width * (scale('x', 1) - scale('x', 0))",
                    },
                    as: "offset",
                },
            ],
            mark: "point",
            encoding: {
                x: {
                    field: "pos",
                    type: "quantitative",
                    scale: { zoom: true },
                },
                xOffset: {
                    field: "offset",
                    type: "quantitative",
                    scale: null,
                },
            },
        };
        const view = await createAndInitialize(spec, UnitView);
        renderToLayout(view, Rectangle.create(0, 0, 200, 100));

        const resolution = view.getScaleResolution("x");
        const initialDomain = resolution.getScale().domain();
        expect(initialDomain[0]).toBeLessThanOrEqual(10);
        expect(initialDomain[1]).toBeGreaterThanOrEqual(100);
        const initialPlacement = [...view.flowHandle.collector.getData()];
        expect(initialPlacement.map((datum) => datum.pos)).toEqual([
            10, 11, 100,
        ]);
        expect(initialPlacement.some((datum) => datum.offset != 0)).toBe(true);

        await resolution.zoomTo([0, 10], false);
        const zoomedPlacement = [...view.flowHandle.collector.getData()];
        expect(zoomedPlacement.map((datum) => datum.offset)).toEqual([0, 0, 0]);
        expect(zoomedPlacement[0]).not.toBe(initialPlacement[0]);
    });

    test("preserves sorted input order and clones rows", () => {
        const input = [{ pos: 0 }, { pos: 0.1 }];
        const { output } = createFlow(input, 20);
        const placed = [...output.getData()];

        expect(placed.map((datum) => datum.offset)).toEqual([-5, 5]);
        expect(placed[0]).not.toBe(input[0]);
        expect(placed[1]).not.toBe(input[1]);
    });

    test("reads collision lengths from a field", () => {
        const { output } = createFlow(
            [
                { pos: 0, length: 10 },
                { pos: 0.05, length: 20 },
            ],
            "length"
        );

        expect([...output.getData()].map((datum) => datum.offset)).toEqual([
            -5, 5,
        ]);
    });

    test("accepts descending raw positions for a negative position factor", () => {
        const { output } = createFlow(
            [{ pos: 0.2 }, { pos: 0 }, { pos: 0 }],
            10,
            -100
        );

        expect([...output.getData()].map((datum) => datum.offset)).toEqual([
            0, -5, 5,
        ]);
    });

    test("rejects input that is not ordered by scaled position", () => {
        expect(() => createFlow([{ pos: 0.1 }, { pos: 0 }], 20)).toThrowError(
            "displace1d items must be ordered by ascending position."
        );
    });

    test("replays an upstream collector when the position factor changes", () => {
        let factor = 100;
        /** @type {() => void} */
        let listener;
        const disposer = vi.fn();
        const paramRuntime = {
            watchExpression: (
                /** @type {string} */ expression,
                /** @type {() => void} */ callback,
                /** @type {{ registerDisposer: (disposer: () => void) => void }} */ options
            ) => {
                expect(expression).toBe("factor");
                listener = callback;
                options.registerDisposer(disposer);
                return () => factor;
            },
        };
        const source = new Collector();
        const transform = new Displace1DTransform(
            {
                type: "displace1d",
                pos: "pos",
                length: 20,
                positionFactor: { expr: "factor" },
                as: "offset",
            },
            /** @type {any} */ ({ paramRuntime })
        );
        const output = new Collector();
        source.addChild(transform);
        transform.addChild(output);
        source.handle({ pos: 0 });
        source.handle({ pos: 0.1 });
        source.complete();

        const initialPlacement = [...output.getData()];
        expect(initialPlacement.map((datum) => datum.offset)).toEqual([-5, 5]);

        factor = 300;
        listener();
        const expandedPlacement = [...output.getData()];
        expect(expandedPlacement.map((datum) => datum.offset)).toEqual([0, 0]);
        expect(expandedPlacement[0]).not.toBe(initialPlacement[0]);

        transform.dispose();
        expect(disposer).toHaveBeenCalledOnce();
    });

    test("rejects a non-finite position factor", () => {
        expect(() => createFlow([{ pos: 0 }], 10, Infinity)).toThrowError(
            "displace1d positionFactor must be a finite number."
        );
    });
});
