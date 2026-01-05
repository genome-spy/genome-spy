import { describe, expect, it } from "vitest";
import { bandScaleDef } from "./band.js";

describe("bandScaleDef normalizeStops", () => {
    it("maps ordinal domains to contiguous indices for stop arrays", () => {
        const result = bandScaleDef.normalizeStops?.({
            name: "x",
            channel:
                /** @type {import("../../../index.d.ts").ChannelConfigResolved} */ ({
                    value: 0,
                    type: "f32",
                    components: 1,
                }),
            scale: {
                type: "band",
                domain: [10, 20, 30],
                range: [5, 15],
            },
            kind: "continuous",
            getDefaultScaleRange: () => [0, 1],
        });

        expect(result).toEqual({
            domain: [0, 3],
            range: [5, 15],
            domainLength: 2,
            rangeLength: 2,
        });
    });

    it("falls back when no ordinal domain is supplied", () => {
        const result = bandScaleDef.normalizeStops?.({
            name: "x",
            channel:
                /** @type {import("../../../index.d.ts").ChannelConfigResolved} */ ({
                    value: 0,
                    type: "f32",
                    components: 1,
                }),
            scale: {
                type: "band",
                range: [0, 1],
            },
            kind: "continuous",
            getDefaultScaleRange: () => [0, 1],
        });

        expect(result).toBeUndefined();
    });
});
