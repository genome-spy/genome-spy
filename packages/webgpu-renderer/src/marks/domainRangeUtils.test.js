import { describe, expect, it } from "vitest";
import {
    coerceRangeValue,
    getDomainRangeKind,
    normalizeDomainRange,
} from "./domainRangeUtils.js";

describe("domainRangeUtils", () => {
    it("detects piecewise scales from linear configs", () => {
        const kind = getDomainRangeKind({
            type: "linear",
            domain: [0, 1, 2],
            range: [0, 1, 2],
        });

        expect(kind).toBe("piecewise");
    });

    it("normalizes continuous domain/range using defaults", () => {
        const channel =
            /** @type {import("../index.d.ts").ChannelConfigResolved} */ ({
                value: 0,
                type: "f32",
                components: 1,
            });
        const result = normalizeDomainRange(
            "x",
            channel,
            { type: "linear" },
            "continuous",
            () => [2, 4]
        );

        expect(result.domain).toEqual([0, 1]);
        expect(result.range).toEqual([2, 4]);
        expect(result.domainLength).toBe(2);
        expect(result.rangeLength).toBe(2);
    });

    it("normalizes threshold colors to vec4 arrays", () => {
        const channel =
            /** @type {import("../index.d.ts").ChannelConfigResolved} */ ({
                value: [0, 0, 0, 1],
                type: "f32",
                components: 4,
            });
        const result = normalizeDomainRange(
            "fill",
            channel,
            {
                type: "threshold",
                domain: [0],
                range: ["#000000", "#ffffff"],
            },
            "threshold",
            () => [0, 1]
        );

        expect(result.range).toEqual([
            [0, 0, 0, 1],
            [1, 1, 1, 1],
        ]);
    });

    it("coerces domain updates from objects", () => {
        const pair = coerceRangeValue({ domain: [3, 7] }, "domain");

        expect(pair).toEqual([3, 7]);
    });
});
