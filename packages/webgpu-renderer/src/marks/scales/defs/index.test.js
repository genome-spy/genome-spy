import { describe, expect, it } from "vitest";
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
});
