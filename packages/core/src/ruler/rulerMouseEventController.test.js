import { describe, expect, test, vi } from "vitest";
import Rectangle from "../view/layout/rectangle.js";
import { RulerMouseEventController } from "./rulerMouseEventController.js";

/**
 * @param {string} type
 * @param {(value: number) => any} [toComplex]
 */
function createScaleResolution(type, toComplex) {
    /** @param {number} value */
    const scale = (value) => value / 100;
    scale.type = type;
    /** @param {number} value */
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
    /** @type {Map<string, any>} */
    const listeners = new Map();
    /** @type {Map<string, any>} */
    const documentListeners = new Map();
    const setValue = vi.fn();
    const view = {
        coords: Rectangle.create(0, 0, 200, 100),
        addInteractionListener(
            /** @type {string} */ type,
            /** @type {any} */ listener
        ) {
            listeners.set(type, listener);
        },
        removeInteractionListener(
            /** @type {string} */ type,
            /** @type {any} */ listener
        ) {
            if (listeners.get(type) === listener) {
                listeners.delete(type);
            }
        },
        paramRuntime: {
            setValue,
        },
    };
    const previousDocument = globalThis.document;
    installMockDocument(documentListeners);
    const gridChild = { view };
    const controller = new RulerMouseEventController(
        /** @type {any} */ (gridChild),
        "cursor",
        ruler,
        /** @type {import("../spec/channel.js").PrimaryPositionalChannel[]} */ (
            Object.keys(scaleResolutions)
        ),
        scaleResolutions
    );

    globalThis.document = previousDocument;

    return { controller, listeners, documentListeners, setValue };
}

/**
 * @param {Map<string, any>} documentListeners
 */
function installMockDocument(documentListeners) {
    globalThis.document = /** @type {Document} */ ({
        addEventListener(
            /** @type {string} */ type,
            /** @type {any} */ listener
        ) {
            documentListeners.set(type, listener);
        },
        removeEventListener(
            /** @type {string} */ type,
            /** @type {any} */ listener
        ) {
            if (documentListeners.get(type) === listener) {
                documentListeners.delete(type);
            }
        },
    });
}

/**
 * @param {Partial<MouseEvent>} [props]
 * @returns {MouseEvent}
 */
function createMouseEvent(props = {}) {
    return /** @type {MouseEvent} */ ({
        shiftKey: false,
        button: 0,
        clientX: 0,
        clientY: 0,
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

    test("dispose removes registered view interaction listeners", () => {
        const { controller, listeners } = createController(
            { encodings: ["x"], on: "mousemove" },
            { x: createScaleResolution("linear") }
        );

        expect(listeners.has("mousemove")).toBe(true);
        expect(listeners.has("mouseleave")).toBe(true);

        controller.dispose();

        expect(listeners.has("mousemove")).toBe(false);
        expect(listeners.has("mouseleave")).toBe(false);
    });

    test("updates immediately on mousedown and tracks document mousemove", () => {
        const { listeners, documentListeners, setValue } = createController(
            { encodings: ["x"], on: "mousedown", snap: false },
            { x: createScaleResolution("linear") }
        );
        const stopPropagation = vi.fn();
        installMockDocument(documentListeners);

        listeners.get("mousedown")({
            point: { x: 50, y: 25 },
            mouseEvent: createMouseEvent({ button: 0, clientX: 150 }),
            proxiedMouseEvent: createMouseEvent(),
            stopPropagation,
        });
        documentListeners.get("mousemove")(createMouseEvent({ clientX: 170 }));
        documentListeners.get("mouseup")(createMouseEvent({ clientX: 170 }));
        globalThis.document = undefined;

        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(setValue).toHaveBeenNthCalledWith(1, "cursor", {
            type: "ruler",
            values: {
                x: 25,
            },
        });
        expect(setValue).toHaveBeenNthCalledWith(2, "cursor", {
            type: "ruler",
            values: {
                x: 35,
            },
        });
        expect(documentListeners.has("mousemove")).toBe(false);
        expect(documentListeners.has("mouseup")).toBe(false);
    });

    test("applies mousedown filters before starting drag", () => {
        const { listeners, documentListeners, setValue } = createController(
            {
                encodings: ["x"],
                on: "mousedown[event.shiftKey]",
                snap: false,
            },
            { x: createScaleResolution("linear") }
        );
        installMockDocument(documentListeners);

        listeners.get("mousedown")({
            point: { x: 50, y: 25 },
            mouseEvent: createMouseEvent({ button: 0, shiftKey: false }),
            proxiedMouseEvent: createMouseEvent({ shiftKey: false }),
            stopPropagation: () => {},
        });
        listeners.get("mousedown")({
            point: { x: 50, y: 25 },
            mouseEvent: createMouseEvent({ button: 0, shiftKey: true }),
            proxiedMouseEvent: createMouseEvent({ shiftKey: true }),
            stopPropagation: () => {},
        });
        globalThis.document = undefined;

        expect(setValue).toHaveBeenCalledOnce();
    });

    test("clears mousedown rulers on mouseup when configured", () => {
        const { listeners, documentListeners, setValue } = createController(
            { encodings: ["x"], on: "mousedown", clear: "mouseup" },
            { x: createScaleResolution("linear") }
        );
        installMockDocument(documentListeners);

        listeners.get("mousedown")({
            point: { x: 50, y: 25 },
            mouseEvent: createMouseEvent({ button: 0 }),
            proxiedMouseEvent: createMouseEvent(),
            stopPropagation: () => {},
        });
        documentListeners.get("mouseup")(createMouseEvent());
        globalThis.document = undefined;

        expect(setValue).toHaveBeenLastCalledWith("cursor", {
            type: "ruler",
            values: {
                x: null,
            },
        });
    });
});
