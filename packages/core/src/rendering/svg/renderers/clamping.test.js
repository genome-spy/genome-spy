// @vitest-environment jsdom
import { expect, onTestFinished, test } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";
import Rectangle from "../../../view/layout/rectangle.js";
import SvgViewRenderingContext from "../svgViewRenderingContext.js";
import SoftwarePickingViewRenderingContext from "../../canvas2d/picking/softwarePickingViewRenderingContext.js";
import SoftwarePickingBuffer from "../../canvas2d/picking/softwarePickingBuffer.js";
import SoftwarePickingRasterizer from "../../canvas2d/picking/softwarePickingRasterizer.js";

/** @param {import("../../../spec/view.js").UnitSpec["mark"]} mark
 * @param {Record<string, number>[]} values
 */
async function render(mark, values) {
    const { view } = await createHeadlessEngine({
        data: { values },
        mark,
        encoding: {
            x: { field: "x", type: "quantitative", scale: null },
            y: { field: "y", type: "quantitative", scale: null },
            ...(values.some((row) => "x2" in row)
                ? { x2: { field: "x2" } }
                : {}),
            ...(values.some((row) => "y2" in row)
                ? { y2: { field: "y2" } }
                : {}),
            color: { value: "black" },
            text: { value: "A" },
        },
    });
    onTestFinished(() => view.disposeSubtree());
    const { svg } = createSvg({
        viewRoot: view,
        logicalWidth: 100,
        logicalHeight: 100,
    });
    return { view, svg };
}

/** @param {Element} element @param {string[]} attributes */
const geometry = (element, attributes) =>
    attributes.map((name) => Number(element.getAttribute(name)));

test.each([
    [true, [0, 250 / 3, 100, 50 / 3]],
    ["x", [0, 250 / 3, 100, 50 / 3]],
    ["y", [-25, 100, 125, 0]],
])("clamping %s preserves diagonal rule direction", async (clamp, expected) => {
    const { svg } = await render(
        {
            type: "rule",
            clamp: /** @type {true | "x" | "y"} */ (clamp),
            clip: false,
        },
        [{ x: -1, x2: 2, y: -0.5, y2: 1.5 }]
    );
    geometry(svg.querySelector("line"), ["x1", "y1", "x2", "y2"]).forEach(
        (value, i) => expect(value).toBeCloseTo(expected[i], 1)
    );
});

test("rules retain horizontal/vertical segments and suppress collapsed geometry before minimum length", async () => {
    const { svg } = await render({ type: "rule", clamp: true, minLength: 20 }, [
        { x: -1, x2: 2, y: 0.5, y2: 0.5 },
        { x: 0.5, x2: 0.5, y: -1, y2: 2 },
        { x: -2, x2: -1, y: -2, y2: -1 },
        { x: 0.5, x2: 0.5, y: 0.5, y2: 0.5 },
    ]);
    expect(
        Array.from(svg.querySelectorAll("line"), (line) =>
            geometry(line, ["x1", "y1", "x2", "y2"])
        )
    ).toEqual([
        [0, 50, 100, 50],
        [50, 100, 50, 0],
    ]);
});

test.each([false, "x", "y", true])(
    "rect clamping stays local to selected axes: %s",
    async (clamp) => {
        const { svg } = await render(
            {
                type: "rect",
                clamp: /** @type {boolean | "x" | "y"} */ (clamp),
                clip: false,
                filled: false,
                stroke: "gray",
            },
            [{ x: 1.2, x2: -0.2, y: 1.3, y2: -0.3 }]
        );
        const x = clamp === true || clamp === "x",
            y = clamp === true || clamp === "y";
        expect(
            geometry(svg.querySelector('[data-mark-type="rect"] rect'), [
                "x",
                "y",
                "width",
                "height",
            ])
        ).toEqual([x ? 0 : -20, y ? 0 : -30, x ? 100 : 140, y ? 100 : 160]);
    }
);

test("rect minimum sizes do not resurrect collapsed bounds", async () => {
    const { svg } = await render({ type: "rect", clamp: true, minWidth: 20 }, [
        { x: -0.4, x2: -0.2, y: 0.2, y2: 0.8 },
        { x: -0.2, x2: 0, y: 0.2, y2: 0.8 },
        { x: 0.2, x2: 0.8, y: 0.2, y2: 0.8 },
    ]);
    expect(svg.querySelectorAll('[data-mark-type="rect"] rect')).toHaveLength(
        1
    );
});

test.each(["link", "arrow"])(
    "collapsed %s endpoints are hidden",
    async (type) => {
        const { svg } = await render(
            { type: /** @type {"link" | "arrow"} */ (type), clamp: true },
            [{ x: -2, x2: -1, y: -2, y2: -1 }]
        );
        expect(svg.querySelector(`[data-mark-type="${type}"]`)).toBeNull();
    }
);

test("text clamps anchors with local offsets and hides collapsed fitting ranges", async () => {
    const { svg } = await render({ type: "text", clamp: true, dx: 3 }, [
        { x: -2, y: 0.5 },
    ]);
    expect(svg.querySelector("text").getAttribute("transform")).toBe(
        "translate(0 50) translate(3 0)"
    );
    const collapsed = await render(
        { type: "text", clamp: "x", squeeze: true },
        [{ x: -2, x2: -1, y: 0.5 }]
    );
    expect(collapsed.svg.querySelector("text")).toBeNull();
});

test("implicit clipping retains thick strokes and overflow into the larger output", async () => {
    const { view } = await render({ type: "rule", clip: false, size: 250 }, [
        { x: 0.5, y: 1, y2: -3 },
    ]);
    // A 100 px child can paint throughout the taller output with clip:false.
    const coords = Rectangle.create(0, 0, 100, 100);
    const context = new SvgViewRenderingContext(
        { picking: false },
        { width: 100, height: 400 }
    );
    view.arrange(context, coords, {});
    expect(
        geometry(context.getSvg().querySelector("line"), ["y1", "y2"])
    ).toEqual([0, 400]);
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
});
