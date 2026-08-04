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
    const collector = new Collector();
    transform.addChild(collector);

    for (const datum of data) {
        transform.handle(datum);
    }
    transform.complete();

    return { collector, transform };
}

describe("Displace1DTransform", () => {
    test("uses one and displacement as grammar defaults", () => {
        const transform = new Displace1DTransform(
            { type: "displace1d", pos: "pos", length: 10 },
            /** @type {any} */ ({})
        );
        const collector = new Collector();
        transform.addChild(collector);
        transform.handle({ pos: 0 });
        transform.complete();

        expect(transform.positionFactor).toBe(1);
        expect([...collector.getData()]).toEqual([{ pos: 0, displacement: 0 }]);
    });

    test("reacts to a scale-dependent position factor without affecting the domain", async () => {
        /** @type {import("../../spec/view.js").UnitSpec} */
        const spec = {
            width: 200,
            height: 100,
            data: { values: [{ pos: 10 }, { pos: 11 }, { pos: 100 }] },
            transform: [
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
        expect(initialPlacement.some((datum) => datum.offset != 0)).toBe(true);

        await resolution.zoomTo([0, 10], false);
        const zoomedPlacement = [...view.flowHandle.collector.getData()];
        expect(zoomedPlacement.map((datum) => datum.offset)).toEqual([0, 0, 0]);
        expect(zoomedPlacement[0]).toBe(initialPlacement[0]);
        expect(zoomedPlacement[1]).toBe(initialPlacement[1]);
        expect(zoomedPlacement[2]).toBe(initialPlacement[2]);
    });

    test("emits reusable clones in input order when the factor changes", () => {
        const input = [{ pos: 0.1 }, { pos: 0 }];
        const { collector, transform } = createFlow(input, 20);

        const firstPlacement = [...collector.getData()];
        expect(firstPlacement.map((datum) => datum.offset)).toEqual([5, -5]);
        expect(firstPlacement[0]).not.toBe(input[0]);

        transform.positionFactor = 300;
        transform._updateAndPropagate();
        const expandedPlacement = [...collector.getData()];
        expect(expandedPlacement.map((datum) => datum.offset)).toEqual([0, 0]);
        expect(expandedPlacement[0]).toBe(firstPlacement[0]);
        expect(expandedPlacement[1]).toBe(firstPlacement[1]);
    });

    test("reads collision lengths from a field", () => {
        const { collector } = createFlow(
            [
                { pos: 0, length: 10 },
                { pos: 0.05, length: 20 },
            ],
            "length"
        );

        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            -5, 5,
        ]);
    });

    test("preserves tie order with a negative position factor", () => {
        const { collector } = createFlow(
            [{ pos: 0 }, { pos: 0 }, { pos: 0.2 }],
            10,
            -100
        );

        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            -5, 5, 0,
        ]);
    });

    test("keeps coincident items displaced when the factor grows", () => {
        const { collector, transform } = createFlow(
            [{ pos: 0 }, { pos: 0 }],
            20
        );
        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            -10, 10,
        ]);

        transform.positionFactor = 10_000;
        transform._updateAndPropagate();
        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            -10, 10,
        ]);
    });

    test("subscribes to and disposes a positionFactor expression", () => {
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
        const collector = new Collector();
        transform.addChild(collector);
        transform.handle({ pos: 0 });
        transform.handle({ pos: 0.1 });
        transform.complete();
        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            -5, 5,
        ]);

        factor = 300;
        listener();
        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            0, 0,
        ]);

        transform.dispose();
        expect(disposer).toHaveBeenCalledOnce();
    });

    test("rejects a non-finite position factor", () => {
        expect(() => createFlow([{ pos: 0 }], 10, Infinity)).toThrowError(
            "displace1d positionFactor must be a finite number."
        );
    });
});
