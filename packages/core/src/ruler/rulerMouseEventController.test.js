import { describe, expect, test, vi } from "vitest";
import Rectangle from "../view/layout/rectangle.js";
import { RulerMouseEventController } from "./rulerMouseEventController.js";

/**
 * @param {string} type
 * @param {(value: number) => any} [toComplex]
 */
function createScaleResolution(type, toComplex) {
    const scale = (value) => value / 100;
    scale.type = type;
    scale.invert = (value) => value * 100;

    return {
        getResolvedScaleType() {
            return type;
        },
        getScale() {
            return scale;
        },
        toComplex,
    };
}

/**
 * @param {any} ruler
 * @param {Record<string, any>} scaleResolutions
 */
function createController(ruler, scaleResolutions) {
    const listeners = new Map();
    const setValue = vi.fn();
    const view = {
        coords: Rectangle.create(0, 0, 200, 100),
        addInteractionListener(type, listener) {
            listeners.set(type, listener);
        },
        paramRuntime: {
            setValue,
        },
    };
    const gridChild = { view };
    const controller = new RulerMouseEventController(
        /** @type {any} */ (gridChild),
        "cursor",
        ruler,
        Object.keys(scaleResolutions),
        scaleResolutions
    );

    return { controller, listeners, setValue };
}

/**
 * @param {Partial<MouseEvent>} [props]
 * @returns {MouseEvent}
 */
function createMouseEvent(props = {}) {
    return /** @type {MouseEvent} */ ({
        shiftKey: false,
        button: 0,
        ...props,
    });
}

describe("RulerMouseEventController", () => {
    test("updates a pointer ruler from mousemove coordinates", () => {
        const { listeners, setValue } = createController(
            { encodings: ["x"], on: "mousemove", snap: false },
            { x: createScaleResolution("linear") }
        );

        listeners.get("mousemove")({
            point: { x: 50, y: 25 },
            proxiedMouseEvent: createMouseEvent(),
        });

        expect(setValue).toHaveBeenCalledWith("cursor", {
            type: "ruler",
            values: {
                x: 25,
            },
        });
    });

    test("applies event filters", () => {
        const { listeners, setValue } = createController(
            {
                encodings: ["x"],
                on: "mousemove[event.shiftKey]",
                snap: false,
            },
            { x: createScaleResolution("linear") }
        );

        listeners.get("mousemove")({
            point: { x: 50, y: 25 },
            proxiedMouseEvent: createMouseEvent({ shiftKey: false }),
        });
        listeners.get("mousemove")({
            point: { x: 50, y: 25 },
            proxiedMouseEvent: createMouseEvent({ shiftKey: true }),
        });

        expect(setValue).toHaveBeenCalledOnce();
    });

    test("snaps index coordinates with auto snapping", () => {
        const { listeners, setValue } = createController(
            { encodings: ["x"], on: "mousemove", snap: "auto" },
            { x: createScaleResolution("index") }
        );

        listeners.get("mousemove")({
            point: { x: 51, y: 25 },
            proxiedMouseEvent: createMouseEvent(),
        });

        expect(setValue).toHaveBeenCalledWith("cursor", {
            type: "ruler",
            values: {
                x: 26,
            },
        });
    });

    test("converts locus coordinates to complex values", () => {
        const { listeners, setValue } = createController(
            { encodings: ["x"], on: "mousemove", snap: "auto" },
            {
                x: createScaleResolution("locus", (value) => ({
                    chrom: "chr1",
                    pos: value,
                })),
            }
        );

        listeners.get("mousemove")({
            point: { x: 51, y: 25 },
            proxiedMouseEvent: createMouseEvent(),
        });

        expect(setValue).toHaveBeenCalledWith("cursor", {
            type: "ruler",
            values: {
                x: { chrom: "chr1", pos: 26 },
            },
        });
    });

    test("clears mousemove rulers on mouseleave by default", () => {
        const { listeners, setValue } = createController(
            { encodings: ["x"], on: "mousemove" },
            { x: createScaleResolution("linear") }
        );

        listeners.get("mouseleave")({});

        expect(setValue).toHaveBeenCalledWith("cursor", {
            type: "ruler",
            values: {
                x: null,
            },
        });
    });
});
