import { expect, test } from "vitest";
import HeadlessTextMetricsProvider from "./headlessTextMetrics.js";

test("provides deterministic fallback metrics", async () => {
    const provider = new HeadlessTextMetricsProvider();
    const measurement = provider.requestFont();

    expect(measurement.measureWidth("ACGT", 12)).toBeCloseTo(
        (111.972 / 41.454) * 12
    );
    expect(measurement.measureWidth("−", 12)).toBe(
        measurement.measureWidth("-", 12)
    );
    expect(measurement.getHeight(12)).toBeCloseTo((37.622 / 41.454) * 12);
    await expect(provider.waitUntilReady()).resolves.toBeUndefined();
});
