import { afterEach, describe, expect, test, vi } from "vitest";

import InteractionEvent from "../utils/interactionEvent.js";
import Point from "./layout/point.js";
import { interactionToZoom, isStillZooming, markZoomActivity } from "./zoom.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("zoom activity tracking", () => {
    test("markZoomActivity updates the recent-zoom timestamp", () => {
        const nowSpy = vi.spyOn(performance, "now");

        nowSpy.mockReturnValueOnce(1000);
        markZoomActivity();

        nowSpy.mockReturnValueOnce(1020);
        expect(isStillZooming()).toBe(true);

        nowSpy.mockReturnValueOnce(1060);
        expect(isStillZooming()).toBe(false);
    });
});

describe("touch gesture zoom conversion", () => {
    test("forwards touchgesture deltas to zoom handler", () => {
        const handleZoom = vi.fn();
        const event = new InteractionEvent(new Point(10, 20), {
            type: "touchgesture",
            phase: "move",
            pointerCount: 1,
            xDelta: 3,
            yDelta: -2,
            zDelta: 0.5,
        });

        interactionToZoom(event, /** @type {any} */ ({}), handleZoom);

        expect(handleZoom).toHaveBeenCalledWith({
            x: 10,
            y: 20,
            xDelta: 3,
            yDelta: -2,
            zDelta: 0.5,
        });
    });

    test("ignores touchgesture with non-finite deltas", () => {
        const handleZoom = vi.fn();
        const event = new InteractionEvent(new Point(10, 20), {
            type: "touchgesture",
            phase: "move",
            pointerCount: 1,
            xDelta: NaN,
            yDelta: 0,
            zDelta: 0,
        });

        interactionToZoom(event, /** @type {any} */ ({}), handleZoom);

        expect(handleZoom).not.toHaveBeenCalled();
    });
});

describe("wheel zoom snapping", () => {
    /**
     * @param {number} deltaY
     */
    const createWheelEvent = (deltaY) =>
        /** @type {WheelEvent} */ ({
            type: "wheel",
            deltaX: 0,
            deltaY,
            deltaMode: 0,
            preventDefault: () => {},
        });

    test("snaps wheel zoom to the closest hovered link endpoint", () => {
        const handleZoom = vi.fn();
        const event = new InteractionEvent(
            new Point(89, 109),
            createWheelEvent(120)
        );

        const hover = {
            mark: {
                getType: () => "link",
                encoders: {
                    x: () => 0.2,
                    y: () => 0.9,
                    x2: () => 0.8,
                    y2: () => 0.1,
                    size: () => 2,
                },
            },
            datum: {},
        };

        // Endpoint 2 maps to canvas coordinates (90, 110) for these encoders.
        interactionToZoom(
            event,
            /** @type {any} */ ({ x: 10, y: 20, width: 100, height: 100 }),
            handleZoom,
            /** @type {any} */ (hover)
        );

        expect(handleZoom).toHaveBeenCalledWith({
            x: 90,
            y: 110,
            xDelta: 0,
            yDelta: 0,
            zDelta: 0.4,
        });
    });

    test("does not snap link wheel zoom when cursor is away from endpoints", () => {
        const handleZoom = vi.fn();
        const event = new InteractionEvent(
            new Point(50, 70),
            createWheelEvent(120)
        );

        const hover = {
            mark: {
                getType: () => "link",
                encoders: {
                    x: () => 0.2,
                    y: () => 0.9,
                    x2: () => 0.8,
                    y2: () => 0.1,
                    size: () => 2,
                },
            },
            datum: {},
        };

        interactionToZoom(
            event,
            /** @type {any} */ ({ x: 10, y: 20, width: 100, height: 100 }),
            handleZoom,
            /** @type {any} */ (hover)
        );

        expect(handleZoom).toHaveBeenCalledWith({
            x: 50,
            y: 70,
            xDelta: 0,
            yDelta: 0,
            zDelta: 0.4,
        });
    });

    test("snaps by x only when y channels are constant", () => {
        const handleZoom = vi.fn();
        const event = new InteractionEvent(
            new Point(30.5, 200),
            createWheelEvent(120)
        );

        const y = Object.assign(() => 0, { constant: true });
        const y2 = Object.assign(() => 0, { constant: true });
        const hover = {
            mark: {
                getType: () => "link",
                encoders: {
                    x: Object.assign(() => 0.2, { constant: false }),
                    y,
                    x2: Object.assign(() => 0.8, { constant: false }),
                    y2,
                    size: () => 2,
                },
            },
            datum: {},
        };

        interactionToZoom(
            event,
            /** @type {any} */ ({ x: 10, y: 20, width: 100, height: 100 }),
            handleZoom,
            /** @type {any} */ (hover)
        );

        expect(handleZoom).toHaveBeenCalledWith({
            x: 30,
            y: 200,
            xDelta: 0,
            yDelta: 0,
            zDelta: 0.4,
        });
    });

    test("applies band offset for locus/index links when snapping", () => {
        const handleZoom = vi.fn();

        const hover = {
            mark: {
                getType: () => "link",
                encoders: {
                    x: Object.assign(() => 0.25, {
                        constant: false,
                        scale: {
                            type: "locus",
                            step: () => 0.1,
                            align: () => 0.5,
                        },
                        channelDef: { band: 0.0 },
                    }),
                    y: Object.assign(() => 0.9, {
                        constant: false,
                    }),
                    x2: Object.assign(() => 0.85, {
                        constant: false,
                        scale: {
                            type: "locus",
                            step: () => 0.1,
                            align: () => 0.5,
                        },
                        channelDef: { band: 0.0 },
                    }),
                    y2: Object.assign(() => 0.1, {
                        constant: false,
                    }),
                    size: () => 2,
                },
            },
            datum: {},
        };

        // Without band correction, endpoint 1 would be at x=35. With band=0.0,
        // rendered endpoint 1 is at x=30.
        interactionToZoom(
            new InteractionEvent(new Point(30, 30), createWheelEvent(120)),
            /** @type {any} */ ({ x: 10, y: 20, width: 100, height: 100 }),
            handleZoom,
            /** @type {any} */ (hover)
        );

        expect(handleZoom).toHaveBeenCalledWith({
            x: 30,
            y: 30,
            xDelta: 0,
            yDelta: 0,
            zDelta: 0.4,
        });
    });

    test("uses implicit band=0.5 for band scales when snapping", () => {
        const handleZoom = vi.fn();

        const hover = {
            mark: {
                getType: () => "link",
                encoders: {
                    x: Object.assign(() => 0.25, {
                        constant: false,
                        scale: {
                            type: "band",
                            bandwidth: () => 0.1,
                        },
                        channelDef: {},
                    }),
                    y: Object.assign(() => 0.9, {
                        constant: false,
                    }),
                    x2: Object.assign(() => 0.85, {
                        constant: false,
                        scale: {
                            type: "band",
                            bandwidth: () => 0.1,
                        },
                        channelDef: {},
                    }),
                    y2: Object.assign(() => 0.1, {
                        constant: false,
                    }),
                    size: () => 2,
                },
            },
            datum: {},
        };

        // With implicit band=0.5, endpoint 1 maps to x=40 (not x=35).
        interactionToZoom(
            new InteractionEvent(new Point(40, 30), createWheelEvent(120)),
            /** @type {any} */ ({ x: 10, y: 20, width: 100, height: 100 }),
            handleZoom,
            /** @type {any} */ (hover)
        );

        expect(handleZoom).toHaveBeenCalledWith({
            x: 40,
            y: 30,
            xDelta: 0,
            yDelta: 0,
            zDelta: 0.4,
        });
    });

    test("prevents default when wheel zoom is handled", () => {
        const preventDefault = vi.fn();
        const wheelEvent = createWheelEvent(120);
        wheelEvent.preventDefault = preventDefault;
        const event = new InteractionEvent(new Point(20, 30), wheelEvent);

        interactionToZoom(
            event,
            /** @type {any} */ ({ x: 10, y: 20, width: 100, height: 100 }),
            () => true
        );

        expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    test("does not prevent default when wheel zoom is not handled", () => {
        const preventDefault = vi.fn();
        const wheelEvent = createWheelEvent(120);
        wheelEvent.preventDefault = preventDefault;
        const event = new InteractionEvent(new Point(20, 30), wheelEvent);

        interactionToZoom(
            event,
            /** @type {any} */ ({ x: 10, y: 20, width: 100, height: 100 }),
            () => false
        );

        expect(preventDefault).not.toHaveBeenCalled();
    });
});
