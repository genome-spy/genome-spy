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
