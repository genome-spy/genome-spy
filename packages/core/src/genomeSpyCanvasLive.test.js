// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("./styles/genome-spy.css.js", () => ({ default: "" }));

import GenomeSpy from "./genomeSpyBase.js";

/** @type {ReturnType<typeof createContext>[]} */
let contexts;
/** @type {string[]} */
let contextTypes;

beforeEach(() => {
    contexts = [];
    contextTypes = [];
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            addEventListener: /** @returns {void} */ () => undefined,
            removeEventListener: /** @returns {void} */ () => undefined,
        }))
    );
    vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn(() => 1)
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

test("launches and paints rects and points without requesting a GPU context", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const genomeSpy = new GenomeSpy(
        container,
        {
            width: 200,
            height: 100,
            padding: 0,
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
                            scale: { domain: [0, 1] },
                            axis: null,
                        },
                        x2: { field: "x2" },
                        y: { value: 0.1 },
                        y2: { value: 0.4 },
                        fill: { value: "#123456" },
                    },
                },
                {
                    mark: "point",
                    encoding: {
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
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

    genomeSpy.destroy();
});

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
