import { describe, expect, test, vi } from "vitest";
import { RulerViewportController } from "./rulerViewportController.js";

/**
 * @param {string} type
 * @param {[number, number]} domain
 */
function createScaleResolution(type, domain) {
    const listeners = {
        domain: new Set(),
        range: new Set(),
    };
    const scale = {
        invert(value) {
            return domain[0] + value * (domain[1] - domain[0]);
        },
    };

    return {
        listeners,
        setDomain(nextDomain) {
            domain = nextDomain;
        },
        getResolvedScaleType() {
            return type;
        },
        getScale() {
            return scale;
        },
        addEventListener(type, listener) {
            listeners[type].add(listener);
        },
        removeEventListener(type, listener) {
            listeners[type].delete(listener);
        },
    };
}

/**
 * @param {any} ruler
 * @param {Record<string, any>} scaleResolutions
 */
function createController(ruler, scaleResolutions) {
    const setValue = vi.fn();
    const view = {
        paramRuntime: {
            setValue,
        },
    };
    const controller = new RulerViewportController(
        /** @type {any} */ ({ view }),
        "center",
        ruler,
        Object.keys(scaleResolutions),
        scaleResolutions
    );

    return { controller, setValue };
}

describe("RulerViewportController", () => {
    test("initializes a viewport ruler from the scale center", () => {
        const { setValue } = createController(
            { source: "viewport", encodings: ["x"], snap: false },
            { x: createScaleResolution("linear", [0, 10]) }
        );

        expect(setValue).toHaveBeenCalledWith("center", {
            type: "ruler",
            values: {
                x: 5,
            },
        });
    });

    test("updates when the scale domain changes", () => {
        const resolution = createScaleResolution("linear", [0, 10]);
        const { setValue } = createController(
            { source: "viewport", encodings: ["x"], snap: false },
            { x: resolution }
        );

        resolution.setDomain([10, 20]);
        for (const listener of resolution.listeners.domain) {
            listener({ type: "domain", scaleResolution: resolution });
        }

        expect(setValue).toHaveBeenLastCalledWith("center", {
            type: "ruler",
            values: {
                x: 15,
            },
        });
    });

    test("updates when the scale range changes", () => {
        const resolution = createScaleResolution("linear", [0, 10]);
        const { setValue } = createController(
            { source: "viewport", encodings: ["x"], snap: false },
            { x: resolution }
        );

        for (const listener of resolution.listeners.range) {
            listener({ type: "range", scaleResolution: resolution });
        }

        expect(setValue).toHaveBeenCalledTimes(2);
    });

    test("snaps discrete viewport coordinates", () => {
        const { setValue } = createController(
            { source: "viewport", encodings: ["x"], snap: "auto" },
            { x: createScaleResolution("index", [0, 11]) }
        );

        expect(setValue).toHaveBeenCalledWith("center", {
            type: "ruler",
            values: {
                x: 6,
            },
        });
    });

    test("rejects pointer events on viewport rulers", () => {
        expect(() =>
            createController(
                { source: "viewport", encodings: ["x"], on: "mousemove" },
                { x: createScaleResolution("linear", [0, 10]) }
            )
        ).toThrow(
            'Ruler param "center" with source "viewport" must not define "on".'
        );
    });
});
