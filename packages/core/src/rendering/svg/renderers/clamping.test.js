// @vitest-environment jsdom

import { expect, test } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";
import Rectangle from "../../../view/layout/rectangle.js";
import PlacementSource from "../../../view/layout/placementSource.js";
import SvgViewRenderingContext from "../svgViewRenderingContext.js";
import SoftwarePickingViewRenderingContext from "../../canvas2d/picking/softwarePickingViewRenderingContext.js";
import SoftwarePickingBuffer from "../../canvas2d/picking/softwarePickingBuffer.js";
import SoftwarePickingRasterizer from "../../canvas2d/picking/softwarePickingRasterizer.js";

/** @param {import("../../../spec/view.js").ViewSpec} spec */
async function render(spec) {
    spec.encoding = { color: { value: "black" }, ...spec.encoding };
    const engine = await createHeadlessEngine(spec);
    const { svg } = createSvg({
        viewRoot: engine.view,
        logicalWidth: 100,
        logicalHeight: 100,
        background: null,
    });
    engine.view.dispose();
    return svg;
}

test("clamps rule endpoints before minimum length without suppressing horizontal or vertical rules", async () => {
    const svg = await render({
        data: {
            values: [
                { x: -10, x2: 10, y: -10, y2: 10 },
                { x: -10, x2: 10, y: 0.5, y2: 0.5 },
                { x: 0.5, x2: 0.5, y: -10, y2: 10 },
                { x: -10, x2: -5, y: -10, y2: -5 },
            ],
        },
        mark: { type: "rule", clamp: true, clip: false, minLength: 5 },
        encoding: {
            x: { field: "x", type: "quantitative", scale: null },
            x2: { field: "x2" },
            y: { field: "y", type: "quantitative", scale: null },
            y2: { field: "y2" },
        },
    });
    expect(
        Array.from(
            svg.querySelectorAll('[data-mark-type="rule"] line'),
            (line) =>
                ["x1", "y1", "x2", "y2"].map((name) =>
                    Number(line.getAttribute(name))
                )
        )
    ).toEqual([
        [0, 100, 100, 0],
        [0, 50, 100, 50],
        [50, 100, 50, 0],
    ]);
});

test.each([
    [true, [0, 250 / 3, 100, 50 / 3]],
    ["x", [0, 250 / 3, 100, 50 / 3]],
    ["y", [-25, 100, 125, 0]],
])(
    "preserves diagonal rule direction when clamping %s",
    async (clamp, expected) => {
        const svg = await render({
            // The line crosses opposite edges away from the viewport corners.
            data: { values: [{ x: -1, x2: 2, y: -0.5, y2: 1.5 }] },
            mark: {
                type: "rule",
                clamp: /** @type {true | "x" | "y"} */ (clamp),
                clip: false,
            },
            encoding: {
                x: { field: "x", type: "quantitative", scale: null },
                x2: { field: "x2" },
                y: { field: "y", type: "quantitative", scale: null },
                y2: { field: "y2" },
            },
        });
        const line = svg.querySelector('[data-mark-type="rule"] line');
        for (const [i, name] of ["x1", "y1", "x2", "y2"].entries()) {
            expect(Number(line.getAttribute(name))).toBeCloseTo(expected[i], 1);
        }
    }
);

test.each([4, 250])(
    "bounds distant rule endpoints with overscan for a %s px stroke",
    async (size) => {
        const svg = await render({
            data: { values: [{}] },
            mark: {
                type: "rule",
                size,
                strokeCap: "round",
            },
            encoding: {
                x: { value: -1000 },
                x2: { value: 1000 },
                y: { value: 0.5 },
            },
        });
        const line = svg.querySelector('[data-mark-type="rule"] line');
        const margin = Math.max(100, size + 1);
        expect(Number(line.getAttribute("x1"))).toBe(-margin);
        expect(Number(line.getAttribute("x2"))).toBe(100 + margin);
    }
);

test.each(["link", "arrow"])(
    "hides a %s when both clamped endpoints coincide",
    async (type) => {
        const svg = await render({
            data: { values: [{}] },
            mark: {
                type: /** @type {"link" | "arrow"} */ (type),
                clamp: true,
                clip: false,
            },
            encoding: {
                x: { value: -10 },
                x2: { value: -5 },
                y: { value: -10 },
                y2: { value: -5 },
            },
        });
        expect(svg.querySelector(`[data-mark-type="${type}"]`)).toBeNull();
    }
);

test("implicit rule clipping preserves visible overflow beyond a small child view", async () => {
    const { view } = await createHeadlessEngine({
        data: {
            values: [
                { y: 1, y2: -3 },
                { y: -2, y2: -3 },
            ],
        },
        mark: { type: "rule", clip: false, size: 4 },
        encoding: {
            x: { value: 0.5 },
            y: { field: "y", type: "quantitative", scale: null },
            y2: { field: "y2" },
            color: { value: "black" },
        },
    });
    // A 100 px child can paint throughout the taller output with clip:false.
    const coords = Rectangle.create(0, 0, 100, 100);
    const context = new SvgViewRenderingContext(
        { picking: false },
        { width: 100, height: 400 }
    );
    view.arrange(context, coords, {});
    expect(
        Array.from(context.getSvg().querySelectorAll("line"), (line) => [
            Number(line.getAttribute("y1")),
            Number(line.getAttribute("y2")),
        ])
    ).toEqual([
        [0, 400],
        [300, 400],
    ]);

    const buffer = new SoftwarePickingBuffer(100, 400);
    const rasterizer = new SoftwarePickingRasterizer(buffer);
    view.arrange(
        new SoftwarePickingViewRenderingContext({
            width: 100,
            height: 400,
            devicePixelRatio: 1,
            getRasterizer: () => rasterizer,
        }),
        coords,
        {}
    );
    expect(buffer.read(50, 350)).toBeGreaterThan(0);
    view.dispose();
});

test.each([false, true])(
    "hides zero-length rules with clamp:%s before minimum-length expansion",
    async (clamp) => {
        const svg = await render({
            data: { values: [{}] },
            mark: {
                type: "rule",
                clamp,
                minLength: 20,
                strokeCap: "round",
                size: 10,
            },
            encoding: {
                x: { value: 0.5 },
                x2: { value: 0.5 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
            },
        });
        expect(svg.querySelector('[data-mark-type="rule"] line')).toBeNull();
    }
);

test("keeps far-offscreen indexed point anchors and applies offsets before clamping", async () => {
    const svg = await render({
        data: { values: [{ x: -100 }] },
        mark: { type: "point", clamp: "x", clip: false, xOffset: -10 },
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                buildIndex: true,
                scale: { domain: [0, 1], zoom: { extent: [-200, 200] } },
                axis: null,
            },
            y: { value: 0.5 },
        },
    });
    const point = svg.querySelector('[data-mark-type="point"] circle');
    expect(point.getAttribute("cx")).toBe("0");
    expect(point.getAttribute("cy")).toBe("50");
});

test("clamps text anchors and hides collapsed explicit fitting ranges", async () => {
    const svg = await render({
        data: { values: [{}] },
        layer: [
            {
                mark: { type: "text", clamp: true, clip: false, dx: 3 },
                encoding: {
                    x: { value: -2 },
                    y: { value: 0.5 },
                    text: { value: "A" },
                },
            },
            {
                mark: { type: "text", clamp: "x", clip: false, squeeze: true },
                encoding: {
                    x: { value: -2 },
                    x2: { value: -1 },
                    y: { value: 0.5 },
                    text: { value: "B" },
                },
            },
        ],
    });
    const texts = svg.querySelectorAll('[data-mark-type="text"] text');
    expect(texts).toHaveLength(1);
    expect(texts[0].getAttribute("transform")).toBe(
        "translate(0 50) translate(3 0)"
    );
});

test("uses local sample bounds and excludes collapsed placements from SVG and software picking", async () => {
    const { view } = await createHeadlessEngine({
        data: {
            values: [
                { facet: 0, x: 0.5, y: 2 },
                { facet: 1, x: 0.5, y: 2 },
                { facet: 1, x: 0.75, y: 0.5 },
            ],
        },
        mark: { type: "point", clamp: true, clip: false, dy: 10 },
        encoding: {
            facetIndex: { field: "facet" },
            x: { field: "x", type: "quantitative", scale: null },
            y: { field: "y", type: "quantitative", scale: null },
            size: { value: 100 },
            fill: { value: "black" },
        },
    });
    const source = new PlacementSource();
    source.replaceTopology(
        [[0], [1]],
        new Float32Array([0, 0.25, 1, 0, 0, 0.5, 1, 0.25])
    );
    const coords = Rectangle.create(0, 0, 100, 100);
    const options = { placement: { source } };
    const context = new SvgViewRenderingContext(
        { picking: false },
        { width: 100, height: 100 }
    );
    view.arrange(context, coords, options);
    const points = context.getSvg().querySelectorAll("circle");
    expect(Array.from(points, (point) => point.getAttribute("cy"))).toEqual([
        "50",
        "52.5",
    ]);

    const buffer = new SoftwarePickingBuffer(100, 100);
    const rasterizer = new SoftwarePickingRasterizer(buffer);
    view.arrange(
        new SoftwarePickingViewRenderingContext({
            width: 100,
            height: 100,
            devicePixelRatio: 1,
            getRasterizer: () => rasterizer,
        }),
        coords,
        options
    );
    expect(buffer.read(50, 25)).toBe(0);
    expect(buffer.read(50, 50)).toBeGreaterThan(0);
    expect(buffer.read(75, 52)).toBeGreaterThan(0);
    view.dispose();
});
