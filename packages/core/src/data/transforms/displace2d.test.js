import { describe, expect, test, vi } from "vitest";
import Rectangle from "../../view/layout/rectangle.js";
import { createAndInitialize, renderToLayout } from "../../view/testUtils.js";
import UnitView from "../../view/unitView.js";
import Collector from "../collector.js";
import Displace2DTransform from "./displace2d.js";
import createTransform from "./transformFactory.js";

/**
 * @param {Record<string, any>[]} data
 * @param {Partial<import("../../spec/transform.js").Displace2DParams>} [overrides]
 */
function createFlow(data, overrides = {}) {
    const source = new Collector();
    const transform = new Displace2DTransform(
        {
            type: "displace2d",
            x: "x",
            y: "y",
            width: 10,
            height: 10,
            xPositionFactor: 100,
            yPositionFactor: 100,
            as: ["dx", "dy"],
            ...overrides,
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

describe("Displace2DTransform", () => {
    test("uses unit factors and displacement field defaults", () => {
        const transform = new Displace2DTransform(
            {
                type: "displace2d",
                x: "x",
                y: "y",
                width: 10,
                height: 10,
            },
            /** @type {any} */ ({})
        );
        const output = new Collector();
        transform.addChild(output);
        transform.handle({ x: 0, y: 0 });
        transform.complete();

        expect(transform.xPositionFactor).toBe(1);
        expect(transform.yPositionFactor).toBe(1);
        expect([...output.getData()]).toEqual([
            { x: 0, y: 0, xDisplacement: 0, yDisplacement: 0 },
        ]);
    });

    test("reacts to zoom without affecting the data-driven domain", async () => {
        /** @type {import("../../spec/view.js").UnitSpec} */
        const spec = {
            width: 200,
            height: 100,
            data: {
                values: [
                    { x: 100, y: 0 },
                    { x: 11, y: 0 },
                    { x: 10, y: 0 },
                ],
            },
            transform: [
                {
                    type: "collect",
                    sort: { field: "x", order: "ascending" },
                },
                {
                    type: "displace2d",
                    x: "x",
                    y: "y",
                    width: 20,
                    height: 20,
                    xPositionFactor: {
                        expr: "width * (scale('x', 1) - scale('x', 0))",
                    },
                    xExtent: [9.5, 100.5],
                    as: ["dx", "dy"],
                },
            ],
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { zoom: true },
                },
                y: { field: "y", type: "quantitative" },
                xOffset: { field: "dx", type: "quantitative", scale: null },
                yOffset: { field: "dy", type: "quantitative", scale: null },
            },
        };
        const view = await createAndInitialize(spec, UnitView);
        renderToLayout(view, Rectangle.create(0, 0, 200, 100));

        const resolution = view.getScaleResolution("x");
        const initialDomain = resolution.getScale().domain();
        expect(initialDomain[0]).toBeLessThanOrEqual(10);
        expect(initialDomain[1]).toBeGreaterThanOrEqual(100);

        const initialPlacement = [...view.flowHandle.collector.getData()];
        expect(initialPlacement.map((datum) => datum.x)).toEqual([10, 11, 100]);
        expect(
            initialPlacement.some((datum) => datum.dx != 0 || datum.dy != 0)
        ).toBe(true);

        const zoomPromise = resolution.zoomTo([0, 10], false);
        await view.paramRuntime.whenPropagated();
        await Promise.resolve();
        const zoomedPlacement = [...view.flowHandle.collector.getData()];
        expect(zoomedPlacement.map(({ dx, dy }) => [dx, dy])).toEqual([
            [0, 0],
            [0, 0],
            [0, 0],
        ]);
        expect(zoomedPlacement[0]).not.toBe(initialPlacement[0]);
        await zoomPromise;
    });

    test("preserves input order and emits signed pixel offsets", () => {
        const input = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        ];
        const { output } = createFlow(input);
        const placed = [...output.getData()];

        expect(placed.map(({ dx, dy }) => [dx, dy])).toEqual([
            [0, 0],
            [0, -10],
        ]);
        expect(placed[0]).toBe(input[0]);
        expect(placed[1]).toBe(input[1]);
    });

    test("retains a valid placement for the same datum across replays", () => {
        const input = [
            { x: 0, y: 0 },
            { x: 0, y: 0.2 },
        ];
        const { output, source, transform } = createFlow(input, {
            xPositionFactor: 20,
            yPositionFactor: 20,
        });

        expect([...output.getData()].map(({ dx, dy }) => [dx, dy])).toEqual([
            [0, 0],
            [0, 10],
        ]);

        transform.yPositionFactor = 100;
        source.repropagate();

        expect([...output.getData()].map(({ dx, dy }) => [dx, dy])).toEqual([
            [0, 0],
            [0, 10],
        ]);
    });

    test("reads collision dimensions from fields", () => {
        const { output } = createFlow(
            [
                { x: 0, y: 0, width: 20, height: 10 },
                { x: 0, y: 0, width: 20, height: 10 },
            ],
            { width: "width", height: "height" }
        );

        expect([...output.getData()].map(({ dx, dy }) => [dx, dy])).toEqual([
            [0, 0],
            [0, -10],
        ]);
    });

    test("scales and normalizes source-coordinate extents", () => {
        const positive = createFlow([{ x: 1.2, y: 0.5 }], {
            width: 20,
            height: 20,
            xExtent: [0, 1],
            yExtent: [0, 1],
        });
        const negative = createFlow([{ x: 1.2, y: 0.5 }], {
            width: 20,
            height: 20,
            xPositionFactor: -100,
            xExtent: [0, 1],
            yExtent: [0, 1],
        });

        expect([...positive.output.getData()][0]).toMatchObject({
            dx: -30,
            dy: 0,
        });
        expect([...negative.output.getData()][0]).toMatchObject({
            dx: 30,
            dy: 0,
        });
    });

    test("coalesces reactive placement changes into one replay", async () => {
        const values = {
            width: 20,
            height: 20,
            xFactor: 100,
            yFactor: 100,
            xExtent: /** @type {[number, number] | undefined} */ ([0, 1]),
            yExtent: /** @type {[number, number] | undefined} */ ([0, 1]),
        };
        /** @type {Map<string, () => void>} */
        const listeners = new Map();
        const paramRuntime = {
            watchExpression: (
                /** @type {keyof typeof values} */ expression,
                /** @type {() => void} */ callback,
                /** @type {{ registerDisposer: (disposer: () => void) => void }} */ options
            ) => {
                listeners.set(expression, callback);
                options.registerDisposer(() => undefined);
                return () => values[expression];
            },
        };
        const source = new Collector();
        const transform = new Displace2DTransform(
            {
                type: "displace2d",
                x: "x",
                y: "y",
                width: { expr: "width" },
                height: { expr: "height" },
                xPositionFactor: { expr: "xFactor" },
                yPositionFactor: { expr: "yFactor" },
                xExtent: { expr: "xExtent" },
                yExtent: { expr: "yExtent" },
                as: ["dx", "dy"],
            },
            /** @type {any} */ ({ paramRuntime })
        );
        const output = new Collector();
        source.addChild(transform);
        transform.addChild(output);
        source.handle({ x: 0.5, y: 0.5 });
        source.handle({ x: 0.5, y: 0.5 });

        const repropagate = vi.spyOn(source, "repropagate");
        source.complete();
        expect([...output.getData()].map(({ dx, dy }) => [dx, dy])).toEqual([
            [0, 0],
            [0, 0],
        ]);

        await Promise.resolve();
        expect(repropagate).toHaveBeenCalledOnce();
        expect([...output.getData()].map(({ dx, dy }) => [dx, dy])).toEqual([
            [0, 0],
            [0, -20],
        ]);
        repropagate.mockClear();

        values.width = 10;
        values.height = 10;
        values.xFactor = -100;
        values.yFactor = -100;
        values.xExtent = undefined;
        values.yExtent = undefined;
        listeners.forEach((listener) => listener());

        await Promise.resolve();
        expect(repropagate).toHaveBeenCalledOnce();
        expect([...output.getData()].map(({ dx, dy }) => [dx, dy])).toEqual([
            [0, 0],
            [0, -20],
        ]);
    });

    test("clears a disabled reactive extent instead of retaining scaled bounds", async () => {
        let extent = /** @type {[number, number] | undefined} */ ([0, 1]);
        /** @type {() => void} */
        let listener;
        const paramRuntime = {
            watchExpression: (
                /** @type {string} */ expression,
                /** @type {() => void} */ callback
            ) => {
                expect(expression).toBe("extent");
                listener = callback;
                return () => extent;
            },
        };
        const source = new Collector();
        const transform = new Displace2DTransform(
            {
                type: "displace2d",
                x: "x",
                y: "y",
                width: 20,
                height: 20,
                xPositionFactor: 100,
                yPositionFactor: 100,
                xExtent: { expr: "extent" },
                as: ["dx", "dy"],
            },
            /** @type {any} */ ({ paramRuntime })
        );
        const output = new Collector();
        source.addChild(transform);
        transform.addChild(output);
        source.handle({ x: 1.2, y: 0.5 });
        source.complete();
        await Promise.resolve();

        expect([...output.getData()][0].dx).toBe(-30);

        extent = undefined;
        listener();
        await Promise.resolve();

        expect(transform.xExtent).toBeUndefined();
        expect([...output.getData()][0].dx).toBe(-30);
    });

    test("cancels the deferred bootstrap replay after disposal", async () => {
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
                return () => 100;
            },
        };
        const source = new Collector();
        const transform = new Displace2DTransform(
            {
                type: "displace2d",
                x: "x",
                y: "y",
                width: 10,
                height: 10,
                xPositionFactor: { expr: "factor" },
            },
            /** @type {any} */ ({ paramRuntime })
        );
        const output = new Collector();
        source.addChild(transform);
        transform.addChild(output);
        source.handle({ x: 0, y: 0 });

        const repropagate = vi.spyOn(source, "repropagate");
        source.complete();
        transform.dispose();
        listener();
        await Promise.resolve();

        expect(repropagate).not.toHaveBeenCalled();
        expect(disposer).toHaveBeenCalledOnce();
    });

    test("rejects invalid parameters and field values", () => {
        expect(() =>
            createFlow([{ x: 0, y: 0 }], {
                xPositionFactor: Infinity,
            })
        ).toThrow("position factors");
        expect(() =>
            createFlow([{ x: 0, y: 0, width: -1 }], {
                width: "width",
            })
        ).toThrow("dimensions");
        expect(
            () =>
                new Displace2DTransform(
                    /** @type {any} */ ({
                        type: "displace2d",
                        x: "x",
                        y: "y",
                        width: 10,
                        height: 10,
                        as: ["offset", "offset"],
                    }),
                    /** @type {any} */ ({})
                )
        ).toThrow("distinct output field names");
    });

    test("is available through the transform factory", () => {
        expect(
            createTransform(
                /** @type {import("../../spec/transform.js").Displace2DParams} */ ({
                    type: "displace2d",
                    x: "x",
                    y: "y",
                    width: 10,
                    height: 10,
                })
            )
        ).toBeInstanceOf(Displace2DTransform);
    });
});
