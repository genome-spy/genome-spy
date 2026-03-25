import { describe, expect, test } from "vitest";
import {
    resolveCaptureDevicePixelRatio,
    resolveExportSize,
} from "./screenshotExport.js";

describe("screenshotExport", () => {
    test("prefers rendered bounds when exporting", () => {
        expect(
            resolveExportSize(
                { width: 123.4, height: 456.7 },
                { width: 600, height: 320 }
            )
        ).toEqual({ width: 124, height: 457 });
    });

    test("falls back to logical size when rendered bounds are missing", () => {
        expect(
            resolveExportSize(
                { width: undefined, height: undefined },
                { width: 600, height: 320 }
            )
        ).toEqual({ width: 600, height: 320 });
    });

    test("keeps DPR at 1 when the export is already tall enough", () => {
        expect(resolveCaptureDevicePixelRatio(400)).toBe(1);
        expect(resolveCaptureDevicePixelRatio(600)).toBe(1);
    });

    test("raises DPR for short exports and rounds up to the next half-step", () => {
        // 399px is just below the threshold, so this exercises the rounding path.
        const logicalHeight = 399;
        const dpr = resolveCaptureDevicePixelRatio(logicalHeight);

        expect(dpr).toBe(1.5);
        expect(Math.floor(logicalHeight * dpr)).toBeGreaterThanOrEqual(400);
    });
});
