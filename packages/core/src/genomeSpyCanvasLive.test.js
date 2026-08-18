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
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        function (callback, type) {
            callback(new Blob(["png"], { type: type ?? "image/png" }));
        }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
        "data:image/png;base64,canvas2d"
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
                {
                    mark: "rule",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        x2: { field: "x2" },
                        y: { value: 0.45 },
                        y2: { value: 0.55 },
                        color: { value: "#334455" },
                        size: { value: 2 },
                    },
                },
                {
                    mark: { type: "link", linkShape: "diagonal" },
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        x2: { field: "x2" },
                        y: { value: 0.2 },
                        y2: { value: 0.8 },
                        color: { value: "#556677" },
                        size: { value: 2 },
                    },
                },
                {
                    mark: "text",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { value: 0.9 },
                        text: { value: "A" },
                        color: { value: "#112233" },
                        size: { value: 12 },
                    },
                },
                {
                    mark: "arrow",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        x2: { field: "x2" },
                        y: { value: 0.6 },
                        y2: { value: 0.6 },
                        fill: { value: "#778899" },
                        size: { value: 4 },
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
    expect(contexts[0].bezierCurveTo).toHaveBeenCalledTimes(2);
    expect(contexts[0].fillText).toHaveBeenCalledTimes(2);
    expect(contexts[0].closePath).toHaveBeenCalled();
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

test("falls back automatically, updates live state, and exports without picking", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const genomeSpy = new GenomeSpy(container, {
        width: 80,
        height: 40,
        padding: 0,
        datasets: { values: [{ x: 0.2, x2: 0.4 }] },
        layer: [
            {
                name: "dynamic",
                data: { name: "values" },
                mark: "rect",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 1] },
                    },
                    x2: { field: "x2" },
                    y: { value: 0.1 },
                    y2: { value: 0.4 },
                    fill: { value: "#123456" },
                },
            },
            {
                name: "initially-hidden",
                visible: false,
                data: { values: [{}] },
                mark: "rect",
                encoding: {
                    x: { value: 0.5 },
                    x2: { value: 0.8 },
                    y: { value: 0.6 },
                    y2: { value: 0.9 },
                    fill: { value: "#abcdef" },
                },
            },
        ],
    });

    expect(await genomeSpy.launch()).toBe(true);
    genomeSpy.renderAll();

    expect(contextTypes).toContain("webgl2");
    expect(contextTypes.filter((type) => type == "2d")).toHaveLength(1);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Canvas2D compatibility renderer")
    );

    const canvas = container.querySelector("canvas");
    if (!canvas) {
        throw new Error("Canvas surface was not created.");
    }
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
        /** @type {DOMRect} */ (
            /** @type {unknown} */ ({
                left: 0,
                top: 0,
                width: 80,
                height: 40,
            })
        )
    );
    const click = vi.fn();
    genomeSpy.addEventListener("click", click);

    expect(() => {
        canvas.dispatchEvent(
            new MouseEvent("mousemove", {
                clientX: 20,
                clientY: 20,
                bubbles: true,
            })
        );
        canvas.dispatchEvent(
            new MouseEvent("click", {
                clientX: 20,
                clientY: 20,
                bubbles: true,
            })
        );
    }).not.toThrow();
    expect(click).toHaveBeenCalledWith({
        type: "click",
        viewPath: null,
        datum: null,
    });
    expect(contextTypes.filter((type) => type == "2d")).toHaveLength(1);

    const paintsBeforeData = contexts[0].fillRect.mock.calls.length;
    genomeSpy.updateNamedData("values", [
        { x: 0.1, x2: 0.2 },
        { x: 0.7, x2: 0.9 },
    ]);
    flushAnimationFrames(2);
    expect(contexts[0].fillRect.mock.calls.length).toBeGreaterThan(
        paintsBeforeData
    );

    const paintsBeforeVisibility = contexts[0].fillRect.mock.calls.length;
    genomeSpy.viewVisibilityPredicate = () => true;
    await genomeSpy.initializeVisibleViewData();
    flushAnimationFrames(2);
    expect(contexts[0].fillRect.mock.calls.length).toBeGreaterThan(
        paintsBeforeVisibility
    );

    const { blob } = await genomeSpy.exportRaster({
        logicalWidth: 40,
        logicalHeight: 20,
        pixelRatio: 2,
        background: null,
    });
    expect(blob.type).toBe("image/png");
    expect(contextTypes.filter((type) => type == "2d")).toHaveLength(2);
    expect(contexts[1].canvas.width).toBe(80);
    expect(contexts[1].canvas.height).toBe(40);
    expect(genomeSpy.exportCanvas()).toBe("data:image/png;base64,canvas2d");
    expect(contextTypes.filter((type) => type == "2d")).toHaveLength(3);

    genomeSpy.destroy();
    warn.mockRestore();
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
        lineCap: "butt",
        lineJoin: "miter",
        lineDashOffset: 0,
        font: "",
        textAlign: "start",
        textBaseline: "alphabetic",
        resetTransform: vi.fn(),
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        closePath: vi.fn(),
        setLineDash: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        measureText: vi.fn(() => ({ width: 1 })),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
    };
}
