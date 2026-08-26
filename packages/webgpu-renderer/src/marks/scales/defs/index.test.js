import { describe, expect, it } from "vitest";
import { packHighPrecisionDomain } from "../../../utils/highPrecision.js";
import { indexScaleDef } from "./index.js";

describe("indexScaleDef stop hooks", () => {
    it("defines fixed stop lengths for high-precision domains", () => {
        const lengths = indexScaleDef.getStopLengths?.({
            name: "x",
            kind: "continuous",
            scale: { type: "index" },
        });

        expect(lengths).toEqual({ domainLength: 3, rangeLength: 2 });
    });

    it("packs two-entry domains into high-precision stops", () => {
        const result = indexScaleDef.normalizeStops?.({
            name: "x",
            channel:
                /** @type {import("../../../index.d.ts").ChannelConfigResolved} */ ({
                    value: 0,
                    type: "f32",
                    components: 1,
                }),
            scale: {
                type: "index",
                domain: [5, 25],
                range: [0, 100],
            },
            kind: "continuous",
            getDefaultScaleRange: () => [0, 1],
        });

        expect(result?.domain).toEqual(packHighPrecisionDomain(5, 25));
        expect(result?.range).toEqual([0, 100]);
        expect(result?.domainLength).toBe(3);
        expect(result?.rangeLength).toBe(2);
    });

    it("accepts three-entry index domains as-is", () => {
        const result = indexScaleDef.normalizeStops?.({
            name: "x",
            channel:
                /** @type {import("../../../index.d.ts").ChannelConfigResolved} */ ({
                    value: 0,
                    type: "f32",
                    components: 1,
                }),
            scale: {
                type: "index",
                domain: [1, 2, 3],
            },
            kind: "continuous",
            getDefaultScaleRange: () => [10, 20],
        });

        expect(result).toEqual({
            domain: [1, 2, 3],
            range: [10, 20],
            domainLength: 3,
            rangeLength: 2,
        });
    });
});
