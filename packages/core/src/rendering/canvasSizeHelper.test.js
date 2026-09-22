// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import CanvasSizeHelper from "./canvasSizeHelper.js";

const originalDprDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "devicePixelRatio"
);

afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDprDescriptor) {
        Object.defineProperty(
            window,
            "devicePixelRatio",
            originalDprDescriptor
        );
    } else {
        delete window.devicePixelRatio;
    }
});

/**
 * @param {number} value
 */
function setDevicePixelRatio(value) {
    // Non-obvious: jsdom's devicePixelRatio is not mutable without redefining.
    Object.defineProperty(window, "devicePixelRatio", {
        value,
        configurable: true,
    });
}

describe("CanvasSizeHelper", () => {
    test("uses fractional content-box size from getBoundingClientRect", () => {
        const container = document.createElement("div");
        const canvas = document.createElement("canvas");
        container.appendChild(canvas);

        container.style.paddingLeft = "1px";
        container.style.paddingRight = "2px";
        container.style.paddingTop = "3px";
        container.style.paddingBottom = "4px";
        container.style.borderLeftWidth = "5px";
        container.style.borderRightWidth = "6px";
        container.style.borderTopWidth = "7px";
        container.style.borderBottomWidth = "8px";
        container.style.borderStyle = "solid";

        container.getBoundingClientRect = () =>
            /** @type {DOMRect} */ ({
                width: 100.5,
                height: 60.25,
            });

        const helper = new CanvasSizeHelper(
            container,
            canvas,
            () => ({
                width: undefined,
                height: undefined,
            }),
            () => {}
        );

        expect(helper.getLogicalCanvasSize()).toEqual({
            width: 86.5,
            height: 38.25,
        });

        helper.finalize();
    });

    test("rounds fallback physical size using window.devicePixelRatio", () => {
        setDevicePixelRatio(1.5);

        const container = document.createElement("div");
        const canvas = document.createElement("canvas");
        container.appendChild(canvas);

        const helper = new CanvasSizeHelper(
            container,
            canvas,
            () => ({
                width: 100.25,
                height: 40.25,
            }),
            () => {}
        );

        expect(helper.getPhysicalCanvasSize()).toEqual({
            width: 150,
            height: 60,
        });

        helper.finalize();
    });

    test("derives DPR from a single non-zero logical dimension", () => {
        setDevicePixelRatio(1.5);

        const container = document.createElement("div");
        const canvas = document.createElement("canvas");
        container.appendChild(canvas);

        const helper = new CanvasSizeHelper(
            container,
            canvas,
            () => ({
                width: 0,
                height: 40,
            }),
            () => {}
        );

        expect(helper.getDevicePixelRatio()).toBe(1.5);

        helper.finalize();
    });
});

test("retains exact observed pixels only for the matching layout and display", () => {
    setDevicePixelRatio(2);
    /** @type {ResizeObserverCallback} */
    let notify;
    vi.stubGlobal(
        "ResizeObserver",
        class {
            /** @param {ResizeObserverCallback} callback */
            constructor(callback) {
                notify = callback;
            }
            observe() {}
            disconnect() {}
        }
    );
    const container = document.createElement("div");
    const canvas = document.createElement("canvas");
    let logical = { width: 100, height: 40 };
    const changed = vi.fn();
    const helper = new CanvasSizeHelper(
        container,
        canvas,
        () => logical,
        changed
    );
    // Browser emulation can report exact physical pixels unlike window DPR.
    /** @param {number} width @param {number} height */
    const report = (width, height) =>
        notify(
            [
                /** @type {ResizeObserverEntry} */ ({
                    target: canvas,
                    contentRect: new DOMRect(
                        0,
                        0,
                        logical.width,
                        logical.height
                    ),
                    borderBoxSize: [],
                    contentBoxSize: [],
                    devicePixelContentBoxSize: [
                        { inlineSize: width, blockSize: height },
                    ],
                }),
            ],
            /** @type {ResizeObserver} */ ({})
        );
    report(100, 40);
    helper.invalidate();
    expect(helper.getPhysicalCanvasSize()).toEqual({ width: 100, height: 40 });
    expect(helper.getDevicePixelRatio()).toBe(1);
    report(100, 40);
    expect(changed).toHaveBeenCalledTimes(1);

    // A layout change invalidates the old measurement until the observer catches up.
    logical = { width: 100.25, height: 40.25 };
    helper.invalidate();
    expect(helper.getPhysicalCanvasSize()).toEqual({ width: 201, height: 81 });
    report(100, 40);
    expect(changed).toHaveBeenCalledTimes(2);
    helper.invalidate();
    expect(helper.getPhysicalCanvasSize()).toEqual({ width: 100, height: 40 });

    // Moving to a different display must not retain its predecessor's measurement.
    setDevicePixelRatio(1.5);
    helper.invalidate();
    expect(helper.getPhysicalCanvasSize()).toEqual({ width: 150, height: 60 });
    report(100, 40);
    expect(changed).toHaveBeenCalledTimes(3);
    expect(helper.getPhysicalCanvasSize()).toEqual({ width: 100, height: 40 });
    helper.finalize();
});
