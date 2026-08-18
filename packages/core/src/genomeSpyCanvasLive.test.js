// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("./styles/genome-spy.css.js", () => ({ default: "" }));

import GenomeSpy from "./genomeSpyBase.js";

/** @type {ReturnType<typeof createContext>[]} */
let contexts;
/** @type {string[]} */
let contextTypes;
/** @type {FrameRequestCallback[]} */
let animationFrames;

beforeEach(() => {
    contexts = [];
    contextTypes = [];
    animationFrames = [];
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            addEventListener: /** @returns {void} */ () => undefined,
            removeEventListener: /** @returns {void} */ () => undefined,
        }))
    );
    vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn((callback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        })
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        function (type) {
            contextTypes.push(type);
            if (type != "2d") {
                throw new Error("Unexpected GPU context request: " + type);
            }
            const context = createContext(this);
            contexts.push(context);
            return /** @type {any} */ (context);
        }
    );
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test("launches, updates expressions, and repaints interactions without a GPU context", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 200,
            height: 100,
            padding: 0,
            params: [{ name: "offset", value: 0 }],
            data: {
                values: [
                    { x: 0.25, x2: 0.45 },
                    { x: 0.55, x2: 0.75 },
                ],
            },
            layer: [
                {
                    mark: "rect",
                    encoding: {
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: {
                                domain: [0, 1],
                                name: "canvas-x",
                                zoom: { extent: "unbounded" },
                            },
                            axis: null,
                        },
                        x2: { field: "x2" },
                        y: { value: 0.1 },
                        y2: { value: 0.4 },
                        fill: { value: "#123456" },
                    },
                },
                {
                    mark: {
                        type: "point",
                        xOffset: { expr: "offset" },
                    },
                    encoding: {
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: {
                                domain: [0, 1],
                                zoom: { extent: "unbounded" },
                            },
                            axis: null,
                        },
                        y: { value: 0.7 },
                        size: { value: 100 },
                        fill: { value: "#abcdef" },
                    },
                },
            ],
        },
        { renderer: "canvas" }
    );

    expect(await genomeSpy.launch()).toBe(true);
    genomeSpy.renderAll();

    expect(contextTypes).toEqual(["2d"]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].fillRect).toHaveBeenCalled();
    expect(contexts[0].arc).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);

    expect(() => genomeSpy.getParam("offset").setValue(5)).not.toThrow();
    flushAnimationFrames(2);

    const canvas = container.querySelector("canvas");
    if (!canvas) {
        throw new Error("Canvas surface was not created.");
    }
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
        /** @type {DOMRect} */ (
            /** @type {unknown} */ ({
                left: 0,
                top: 0,
                width: 200,
                height: 100,
            })
        )
    );
    const xScale = genomeSpy.getNamedScaleResolutions().get("canvas-x");
    if (!xScale) {
        throw new Error("Named Canvas scale was not created.");
    }
    const initialDomain = xScale.getDomain().slice();
    const initialPaints = contexts[0].fillRect.mock.calls.length;

    canvas.dispatchEvent(
        new WheelEvent("wheel", {
            clientX: 100,
            clientY: 50,
            deltaY: 60,
            cancelable: true,
        })
    );
    flushAnimationFrames(4);

    expect(xScale.getDomain()).not.toEqual(initialDomain);
    expect(contexts[0].fillRect.mock.calls.length).toBeGreaterThan(
        initialPaints
    );

    const wheelDomain = xScale.getDomain().slice();
    const wheelPaints = contexts[0].fillRect.mock.calls.length;
    canvas.dispatchEvent(
        new MouseEvent("mousedown", {
            button: 0,
            buttons: 1,
            clientX: 100,
            clientY: 50,
            bubbles: true,
        })
    );
    document.dispatchEvent(
        new MouseEvent("mousemove", {
            buttons: 1,
            clientX: 120,
            clientY: 50,
            bubbles: true,
        })
    );
    document.dispatchEvent(
        new MouseEvent("mouseup", {
            button: 0,
            clientX: 120,
            clientY: 50,
            bubbles: true,
        })
    );
    flushAnimationFrames(2);

    expect(xScale.getDomain()).not.toEqual(wheelDomain);
    expect(contexts[0].fillRect.mock.calls.length).toBeGreaterThan(wheelPaints);

    genomeSpy.destroy();
});

/** @param {number} count */
function flushAnimationFrames(count) {
    const start = performance.now();
    for (let i = 0; i < count; i++) {
        const callbacks = animationFrames.splice(0);
        for (const callback of callbacks) {
            callback(start + (i + 1) * 16);
        }
    }
}

/** @param {HTMLCanvasElement} canvas */
function createContext(canvas) {
    return {
        canvas,
        fillStyle: "#000000",
        strokeStyle: "#000000",
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        lineWidth: 1,
        resetTransform: vi.fn(),
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
    };
}
