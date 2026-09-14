import { describe, expect, test, vi } from "vitest";
import ViewParamRuntime from "../../paramRuntime/viewParamRuntime.js";
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
    test.each([false, true])(
        "places across file boundaries and preserves events (faceted: %s)",
        (faceted) => {
            const transform = new Displace2DTransform(
                { type: "displace2d", x: "x", y: "y", width: 10, height: 10 },
                /** @type {any} */ ({})
            );
            const output = new Collector();
            transform.addChild(output);
            const batches = vi.spyOn(output, "beginBatch");
            const rows = vi.spyOn(output, "handle");

            // Files share collision space within a facet, but facets do not.
            for (const facet of faceted ? ["a", "b"] : [undefined]) {
                if (faceted) {
                    transform.beginBatch({ type: "facet", facetId: [facet] });
                }
                for (const url of ["first.json", "second.json"]) {
                    transform.beginBatch({ type: "file", url });
                    transform.handle({ x: 0, y: 0 });
                }
            }
            transform.complete();

            const offsets = Array.from(output.getData(), (datum) => [
                datum.xDisplacement,
                datum.yDisplacement,
            ]);
            expect(offsets).toEqual(
                faceted
                    ? [
                          [0, 0],
                          [0, -10],
                          [0, 0],
                          [0, -10],
                      ]
                    : [
                          [0, 0],
                          [0, -10],
                      ]
            );

            const fileCalls = batches.mock.calls.flatMap(([batch], index) =>
                batch.type == "file"
                    ? [
                          {
                              url: batch.url,
                              order: batches.mock.invocationCallOrder[index],
                          },
                      ]
                    : []
            );
            expect(fileCalls.map(({ url }) => url)).toEqual(
                faceted
                    ? ["first.json", "second.json", "first.json", "second.json"]
                    : ["first.json", "second.json"]
            );
            for (let i = 0; i < fileCalls.length; i++) {
                expect(fileCalls[i].order).toBeLessThan(
                    rows.mock.invocationCallOrder[i]
                );
                if (i > 0) {
                    expect(rows.mock.invocationCallOrder[i - 1]).toBeLessThan(
                        fileCalls[i].order
                    );
                }
            }
        }
    );

    test("preserves facet membership and places facets independently", () => {
        const transform = new Displace2DTransform(
            { type: "displace2d", x: "x", y: "y", width: 10, height: 10 },
            /** @type {any} */ ({})
        );
        const output = new Collector();
        transform.addChild(output);
        for (const id of ["a", "b"]) {
            transform.beginBatch({ type: "facet", facetId: [id] });
            transform.handle({ id, x: 0, y: 0 });
        }
        transform.complete();
        for (const id of ["a", "b"]) {
            expect(output.facetBatches.get([id])).toEqual([
                { id, x: 0, y: 0, xDisplacement: 0, yDisplacement: 0 },
            ]);
        }
    });

    test("debounces placement across upstream scale-driven replay", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            const view = await createAndInitialize(
                {
                    width: 100,
                    height: 100,
                    data: {
                        values: [
                            { x: 0.4, y: 0.5 },
                            { x: 0.6, y: 0.5 },
                        ],
                    },
                    transform: [
                        {
                            type: "formula",
                            expr: "domain('x')[1]",
                            as: "domainEnd",
                        },
                        {
                            type: "displace2d",
                            x: "x",
                            y: "y",
                            width: 10,
                            height: 10,
                            scalePositions: true,
                        },
                    ],
                    mark: "point",
                    encoding: {
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: { domain: [0, 4], zoom: true },
                        },
                        y: {
                            field: "y",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                        },
                    },
                },
                UnitView
            );
            renderToLayout(view, Rectangle.create(0, 0, 100, 100));
            view.handleBroadcast({ type: "layoutComputed" });
            await view.paramRuntime.whenPropagated();
            const offsets = () =>
                Array.from(view.flowHandle.collector.getData(), (datum) => [
                    datum.xDisplacement,
                    datum.yDisplacement,
                ]);
            const initialOffsets = offsets();
            expect(initialOffsets.some(([dx, dy]) => dx != 0 || dy != 0)).toBe(
                true
            );

            const resolution = view.getScaleResolution("x");
            await resolution.zoomTo([0, 2], false);
            await vi.advanceTimersByTimeAsync(25);
            await resolution.zoomTo([0, 1], false);
            await vi.advanceTimersByTimeAsync(49);
            expect(offsets()).toEqual(initialOffsets);

            await vi.advanceTimersByTimeAsync(1);
            await view.paramRuntime.whenPropagated();
            expect(offsets()).toEqual([
                [0, 0],
                [0, 0],
            ]);
        } finally {
            vi.useRealTimers();
        }
    });

    test("restores canonical offsets after intermediate geometry", () => {
        const transform = new Displace2DTransform(
            {
                type: "displace2d",
                x: "x",
                y: "y",
                width: 10,
                height: 10,
                as: ["dx", "dy"],
            },
            /** @type {any} */ ({})
        );
        const output = new Collector();
        transform.addChild(output);
        const home = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        ];
        const place = (/** @type {Record<string, number>[]} */ data) => {
            transform.reset();
            for (const datum of structuredClone(data)) {
                transform.handle(datum);
            }
            transform.complete();
            return Array.from(output.getData(), ({ dx, dy }) => [dx, dy]);
        };

        const initial = place(home);
        place(home.map((datum, i) => ({ ...datum, x: i * 3 })));

        expect(place(home)).toEqual(initial);
    });

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

    test("uses data-driven domains and reacts to zoom", async () => {
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
                    scalePositions: true,
                    debounce: 0,
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
        view.handleBroadcast({ type: "layoutComputed" });
        await Promise.resolve();

        const resolution = view.getScaleResolution("x");
        const initialDomain = resolution.getScale().domain();
        expect(initialDomain[0]).toBeLessThanOrEqual(10);
        expect(initialDomain[1]).toBeGreaterThanOrEqual(100);

        const initialPlacement = [...view.flowHandle.collector.getData()];
        expect(initialPlacement.map((datum) => datum.x)).toEqual([10, 11, 100]);
        expect(
            initialPlacement.some((datum) => datum.dx != 0 || datum.dy != 0)
        ).toBe(true);

        const zoomPromise = resolution.zoomTo([9.5, 11.5], false);
        await view.paramRuntime.whenPropagated();
        await Promise.resolve();
        const zoomedPlacement = [...view.flowHandle.collector.getData()];
        expect(
            zoomedPlacement.slice(0, 2).map(({ dx, dy }) => [dx, dy])
        ).toEqual([
            [0, 0],
            [0, 0],
        ]);
        expect(zoomedPlacement[2].dx).toBeLessThan(0);
        expect(zoomedPlacement[0]).not.toBe(initialPlacement[0]);
        await zoomPromise;
    });

    test("maps positions through view scales and reacts to zoom", async () => {
        /** @type {import("../../spec/view.js").UnitSpec} */
        const spec = {
            width: 200,
            height: 100,
            data: {
                values: [
                    { x: 4.9, y: 5 },
                    { x: 5.1, y: 5 },
                ],
            },
            transform: [
                {
                    type: "displace2d",
                    x: "x",
                    y: "y",
                    width: 10,
                    height: 10,
                    scalePositions: true,
                    debounce: 0,
                    as: ["dx", "dy"],
                },
            ],
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 10], zoom: true },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { domain: [0, 10] },
                },
                xOffset: { field: "dx", type: "quantitative", scale: null },
                yOffset: { field: "dy", type: "quantitative", scale: null },
            },
        };
        const view = await createAndInitialize(spec, UnitView);
        renderToLayout(view, Rectangle.create(0, 0, 200, 100));
        view.handleBroadcast({ type: "layoutComputed" });
        await Promise.resolve();

        expect(
            [...view.flowHandle.collector.getData()].some(
                ({ dx, dy }) => dx != 0 || dy != 0
            )
        ).toBe(true);

        const resolution = view.getScaleResolution("x");
        const zoomPromise = resolution.zoomTo([4, 6], false);
        await view.paramRuntime.whenPropagated();
        expect(
            [...view.flowHandle.collector.getData()].map(({ dx, dy }) => [
                dx,
                dy,
            ])
        ).toEqual([
            [0, 0],
            [0, 0],
        ]);
        await zoomPromise;

        renderToLayout(view, Rectangle.create(0, 0, 40, 100));
        view.handleBroadcast({ type: "layoutComputed" });
        await Promise.resolve();
        expect(
            [...view.flowHandle.collector.getData()].some(
                ({ dx, dy }) => dx != 0 || dy != 0
            )
        ).toBe(true);
    });

    test("respects nonlinear reversed scales", async () => {
        /** @type {import("../../spec/view.js").UnitSpec} */
        const spec = {
            width: 200,
            height: 100,
            data: { values: [{ x: 1000, y: 5 }] },
            transform: [
                {
                    type: "displace2d",
                    x: "x",
                    y: "y",
                    width: 20,
                    height: 20,
                    scalePositions: true,
                    as: ["dx", "dy"],
                },
            ],
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { type: "log", domain: [1, 100], reverse: true },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { domain: [0, 10] },
                },
                xOffset: { field: "dx", type: "quantitative", scale: null },
                yOffset: { field: "dy", type: "quantitative", scale: null },
            },
        };
        const view = await createAndInitialize(spec, UnitView);
        renderToLayout(view, Rectangle.create(0, 0, 200, 100));
        view.handleBroadcast({ type: "layoutComputed" });
        await Promise.resolve();

        const datum = [...view.flowHandle.collector.getData()][0];
        expect(datum.dx).toBeCloseTo(110);
        expect(datum.dy).toBe(0);
    });

    test.each([
        [false, 110],
        [true, -110],
    ])(
        "maps reverse=%s y scales to downward screen coordinates",
        async (reverse, expectedDy) => {
            /** @type {import("../../spec/view.js").UnitSpec} */
            const spec = {
                width: 200,
                height: 100,
                data: { values: [{ x: 5, y: 20 }] },
                transform: [
                    {
                        type: "displace2d",
                        x: "x",
                        y: "y",
                        width: 20,
                        height: 20,
                        scalePositions: true,
                        as: ["dx", "dy"],
                    },
                ],
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 10] },
                    },
                    y: {
                        field: "y",
                        type: "quantitative",
                        scale: { domain: [0, 10], reverse },
                    },
                    xOffset: {
                        field: "dx",
                        type: "quantitative",
                        scale: null,
                    },
                    yOffset: {
                        field: "dy",
                        type: "quantitative",
                        scale: null,
                    },
                },
            };
            const view = await createAndInitialize(spec, UnitView);
            renderToLayout(view, Rectangle.create(0, 0, 200, 100));
            view.handleBroadcast({ type: "layoutComputed" });
            await Promise.resolve();

            const datum = [...view.flowHandle.collector.getData()][0];
            expect(datum.dx).toBe(0);
            expect(datum.dy).toBeCloseTo(expectedDy);
        }
    );

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

    test("recomputes canonical placement across replays", () => {
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
            [0, 0],
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

    test("avoids anchor dimensions read from fields", () => {
        const { output } = createFlow(
            [{ x: 0, y: 0, anchorWidth: 4, anchorHeight: 4 }],
            { anchorWidth: "anchorWidth", anchorHeight: "anchorHeight" }
        );

        expect([...output.getData()].map(({ dx, dy }) => [dx, dy])).toEqual([
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
        const paramRuntime = new ViewParamRuntime();
        const setWidth = paramRuntime.registerParam({
            name: "width",
            value: 20,
        });
        const setHeight = paramRuntime.registerParam({
            name: "height",
            value: 20,
        });
        const setXFactor = paramRuntime.registerParam({
            name: "xFactor",
            value: 100,
        });
        const setYFactor = paramRuntime.registerParam({
            name: "yFactor",
            value: 100,
        });
        const setXExtent = paramRuntime.registerParam({
            name: "xExtent",
            value: [0, 1],
        });
        const setYExtent = paramRuntime.registerParam({
            name: "yExtent",
            value: [0, 1],
        });
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
                debounce: 0,
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

        paramRuntime.runInTransaction(() => {
            setWidth(10);
            setHeight(10);
            setXFactor(-100);
            setYFactor(-100);
            setXExtent(undefined);
            setYExtent(undefined);
        });
        await paramRuntime.whenPropagated();
        expect(repropagate).toHaveBeenCalledOnce();
        expect([...output.getData()].map(({ dx, dy }) => [dx, dy])).toEqual([
            [0, 0],
            [0, -10],
        ]);
    });

    test("debounces reactive placement changes", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            const paramRuntime = new ViewParamRuntime();
            const setHeight = paramRuntime.registerParam({
                name: "height",
                value: 20,
            });
            const source = new Collector();
            const transform = new Displace2DTransform(
                {
                    type: "displace2d",
                    x: "x",
                    y: "y",
                    width: 20,
                    height: { expr: "height" },
                    as: ["dx", "dy"],
                },
                /** @type {any} */ ({ paramRuntime })
            );
            const output = new Collector();
            source.addChild(transform);
            transform.addChild(output);
            source.handle({ x: 0, y: 0 });
            source.handle({ x: 0, y: 0 });
            source.complete();
            await paramRuntime.whenPropagated();

            const offsets = () =>
                Array.from(output.getData(), ({ dx, dy }) => [dx, dy]);
            expect(offsets()).toEqual([
                [0, 0],
                [0, -20],
            ]);

            setHeight(10);
            await vi.advanceTimersByTimeAsync(49);
            expect(offsets()).toEqual([
                [0, 0],
                [0, -20],
            ]);

            await vi.advanceTimersByTimeAsync(1);
            await paramRuntime.whenPropagated();
            expect(offsets()).toEqual([
                [0, 0],
                [0, -10],
            ]);
        } finally {
            vi.useRealTimers();
        }
    });

    test("clears a disabled reactive extent instead of retaining scaled bounds", async () => {
        const paramRuntime = new ViewParamRuntime();
        const setExtent = paramRuntime.registerParam({
            name: "extent",
            value: [0, 1],
        });
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
                debounce: 0,
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

        setExtent(undefined);
        await paramRuntime.whenPropagated();

        expect(transform.xExtent).toBeUndefined();
        expect([...output.getData()][0].dx).toBe(0);
    });

    test("cancels the deferred bootstrap replay after disposal", async () => {
        const paramRuntime = new ViewParamRuntime();
        const setFactor = paramRuntime.registerParam({
            name: "factor",
            value: 100,
        });
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
        setFactor(200);
        await paramRuntime.whenPropagated();

        expect(repropagate).not.toHaveBeenCalled();
    });

    test("cancels a pending debounced replay after disposal", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            const paramRuntime = new ViewParamRuntime();
            const setHeight = paramRuntime.registerParam({
                name: "height",
                value: 20,
            });
            const source = new Collector();
            const transform = new Displace2DTransform(
                {
                    type: "displace2d",
                    x: "x",
                    y: "y",
                    width: 20,
                    height: { expr: "height" },
                },
                /** @type {any} */ ({ paramRuntime })
            );
            const output = new Collector();
            source.addChild(transform);
            transform.addChild(output);
            source.handle({ x: 0, y: 0 });

            const repropagate = vi.spyOn(source, "repropagate");
            source.complete();
            await paramRuntime.whenPropagated();
            repropagate.mockClear();

            setHeight(10);
            transform.dispose();
            await vi.advanceTimersByTimeAsync(50);

            expect(repropagate).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    test("rejects invalid parameters and field values", () => {
        expect(() =>
            createFlow([{ x: 0, y: 0 }], {
                xPositionFactor: Infinity,
            })
        ).toThrow("position factors");
        expect(() =>
            createFlow([{ x: 0, y: 0 }], {
                debounce: -1,
            })
        ).toThrow("debounce");
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
        expect(
            () =>
                new Displace2DTransform(
                    {
                        type: "displace2d",
                        x: "x",
                        y: "y",
                        width: 10,
                        height: 10,
                        scalePositions: true,
                        xExtent: [0, 1],
                    },
                    /** @type {any} */ ({})
                )
        ).toThrow("cannot be combined");
        expect(
            () =>
                new Displace2DTransform(
                    {
                        type: "displace2d",
                        x: "x",
                        y: "y",
                        width: 10,
                        height: 10,
                        scalePositions: true,
                    },
                    /** @type {any} */ ({})
                )
        ).toThrow("requires a view");
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
