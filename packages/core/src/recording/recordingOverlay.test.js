// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import recordingOverlay from "./recordingOverlay.js";

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function setup() {
    document.body.innerHTML = `<div class="genome-spy"><div><canvas width="400" height="200"></canvas></div><div class="gs-tooltip"><div class="title">Example</div><table class="attributes"><tr><th>x</th><td>42</td></tr></table></div></div><div class="genome-spy"><div class="gs-tooltip">Other embed</div></div>`;
    const canvas = document.querySelector("canvas");
    const tooltip = document.querySelector(".gs-tooltip");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
        new DOMRect(10, 20, 200, 100)
    );
    vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(
        new DOMRect(180, 90, 100, 60)
    );
    const visible = vi
        .spyOn(tooltip, "getClientRects")
        .mockReturnValue(/** @type {any} */ ([new DOMRect()]));
    tooltip.setAttribute("style", "background-color: rgb(246, 246, 246)");
    const cell = tooltip.querySelector("th");
    cell.setAttribute("style", "font: bold 12px Arial; color: rgb(20, 30, 40)");
    // jsdom has no text layout: provide browser-like range geometry.
    vi.spyOn(document, "createRange").mockImplementation(
        () =>
            /** @type {any} */ ({
                setStart: vi.fn(),
                setEnd: vi.fn(),
                getClientRects: () => [new DOMRect(190, 100, 30, 14)],
                getBoundingClientRect: () => new DOMRect(190, 100, 30, 14),
            })
    );
    const context = /** @type {any} */ (
        Object.fromEntries(
            [
                "setLineDash",
                "save",
                "restore",
                "scale",
                "translate",
                "beginPath",
                "closePath",
                "moveTo",
                "lineTo",
                "rect",
                "clip",
                "fill",
                "stroke",
                "fillRect",
                "strokeRect",
                "fillText",
            ].map((name) => [name, vi.fn()])
        )
    );
    context.measureText = (/** @type {string} */ text) => ({
        width: text.length * 7,
        fontBoundingBoxAscent: 11,
        fontBoundingBoxDescent: 3,
    });
    context.getTransform = () => ({ a: 2 });
    const controller = new AbortController();
    const draw = recordingOverlay(canvas, controller.signal);
    const move = (x = 60, y = 50) =>
        canvas.dispatchEvent(
            new MouseEvent("pointermove", { clientX: x, clientY: y })
        );
    return { canvas, tooltip, context, controller, draw, move, visible };
}

it("composes the owning standard tooltip and pointer in CSS coordinates at high DPI", () => {
    const { context, draw, move } = setup();
    move();
    draw(context);
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.translate).toHaveBeenCalledWith(50, 30);
    expect(
        context.fillText.mock.calls.map(
            (/** @type {string[]} */ call) => call[0]
        )
    ).toEqual(["Example", "x", "42"]);
    // Keep viewport placement even when the tooltip extends beyond the plot.
    expect(context.translate).toHaveBeenCalledWith(-10, -20);
    expect(context.fillRect).toHaveBeenCalledWith(180, 90, 100, 60);
    expect(context.fillText).toHaveBeenCalledWith("x", 190, 111);
});

it("reads asynchronous tooltip updates without requiring another pointer event", () => {
    const { tooltip, context, draw, move } = setup();
    move();
    draw(context);
    tooltip.querySelector("td").textContent = "43";
    draw(context);
    expect(context.fillText.mock.calls.at(-1)[0]).toBe("43");
});

it("omits hidden and custom HTML tooltips", () => {
    const { tooltip, context, draw, move, visible } = setup();
    move();
    visible.mockReturnValue(/** @type {any} */ ([]));
    draw(context);
    expect(context.fillText).not.toHaveBeenCalled();
    visible.mockReturnValue(/** @type {any} */ ([new DOMRect()]));
    tooltip.innerHTML = "<img src='custom.png'><p>Custom content</p>";
    draw(context);
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.translate).toHaveBeenCalledTimes(2);
});

it("hides on pointer exit and removes input listeners on cancellation", () => {
    const { canvas, context, draw, move, controller } = setup();
    move();
    canvas.dispatchEvent(new Event("pointerleave"));
    draw(context);
    expect(context.save).not.toHaveBeenCalled();
    controller.abort();
    move();
    draw(context);
    expect(context.save).not.toHaveBeenCalled();
});

it("uses computed text styles and paints standard color swatches", () => {
    const { tooltip, context, draw, move } = setup();
    const swatch = document.createElement("span");
    swatch.className = "color-legend";
    swatch.style.backgroundColor = "rgb(100, 149, 237)";
    tooltip.querySelector("td").append(swatch);
    vi.spyOn(swatch, "getBoundingClientRect").mockReturnValue(
        new DOMRect(220, 110, 10, 10)
    );
    /** @type {string[][]} */
    const painted = [];
    context.fillText.mockImplementation((/** @type {string} */ text) =>
        painted.push([text, context.font, context.fillStyle])
    );
    /** @type {string[]} */
    const boxes = [];
    context.fillRect.mockImplementation(() => boxes.push(context.fillStyle));
    move();
    draw(context);
    expect(painted).toContainEqual([
        "x",
        "normal bold 12px Arial",
        "rgb(20, 30, 40)",
    ]);
    expect(boxes).toEqual(
        expect.arrayContaining(["rgb(246, 246, 246)", "rgb(100, 149, 237)"])
    );
    expect(context.fillRect).toHaveBeenCalledWith(220, 110, 10, 10);
});

it("keeps wrapped text on its browser-layout lines", () => {
    const { tooltip, context, draw, move } = setup();
    tooltip.querySelector("td").textContent = "AB";
    vi.mocked(document.createRange).mockImplementation(() => {
        let index = 0;
        return /** @type {any} */ ({
            selectNodeContents: vi.fn(),
            getClientRects: () => [new DOMRect(), new DOMRect()],
            setStart: (
                /** @type {Node} */ _node,
                /** @type {number} */ offset
            ) => {
                index = offset;
            },
            setEnd: vi.fn(),
            getBoundingClientRect: () =>
                new DOMRect(190, 100 + index * 14, 7, 14),
        });
    });
    move();
    draw(context);
    expect(context.fillText).toHaveBeenCalledWith("A", 190, 111);
    expect(context.fillText).toHaveBeenCalledWith("B", 190, 125);
});

it("collapses ordinary tooltip whitespace without collapsing nonbreaking spaces", () => {
    const { tooltip, context, draw, move } = setup();
    tooltip.querySelector("td").textContent = "  A  B\nC\tD\u00a0\u00a0E  ";
    move();
    draw(context);
    expect(context.fillText).toHaveBeenCalledWith(
        "A B C D\u00a0\u00a0E",
        190,
        111
    );
    const range = vi.mocked(document.createRange).mock.results.at(-1).value;
    expect(range.setStart).toHaveBeenCalledWith(
        tooltip.querySelector("td").firstChild,
        2
    );
});
