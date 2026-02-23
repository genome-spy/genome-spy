import { afterEach, describe, expect, test, vi } from "vitest";

import { isStillZooming, markZoomActivity } from "./zoom.js";

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
