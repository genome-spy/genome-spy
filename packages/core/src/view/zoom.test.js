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
