import { describe, expect, test } from "vitest";

import { getClientDistance, pinchDistanceToZoomDelta } from "./pinchZoom.js";

describe("pinch zoom helpers", () => {
    test("computes euclidean distance in client space", () => {
        const distance = getClientDistance(
            { clientX: 10, clientY: 20 },
            { clientX: 13, clientY: 24 }
        );

        expect(distance).toBe(5);
    });

    test("maps pinch-out to negative zDelta (zoom-in)", () => {
        // Distances double -> scaleFactor 0.5 -> zDelta -1.
        const zDelta = pinchDistanceToZoomDelta(40, 80);
        expect(zDelta).toBeCloseTo(-1);
    });

    test("maps pinch-in to positive zDelta (zoom-out)", () => {
        const zDelta = pinchDistanceToZoomDelta(80, 40);
        expect(zDelta).toBeCloseTo(1);
    });

    test("returns zero when distances are non-positive", () => {
        expect(pinchDistanceToZoomDelta(0, 10)).toBe(0);
        expect(pinchDistanceToZoomDelta(10, 0)).toBe(0);
    });
});
