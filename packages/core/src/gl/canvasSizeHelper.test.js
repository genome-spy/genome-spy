// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import CanvasSizeHelper from "./canvasSizeHelper.js";

const originalDprDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "devicePixelRatio"
);

afterEach(() => {
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
