import { expect, test } from "vitest";
import { packFractionalIndex } from "./fractionalIndex.js";

test.each([0, 2 ** 24, 2 ** 32, 2 ** 40])(
    "packing retains integer and fraction near %s",
    (start) => {
        const value = start + 4095.625;
        const packed = Uint32Array.from(packFractionalIndex(value));
        const fraction = new Float32Array(packed.buffer)[2];
        expect(packed[0] * 4096 + packed[1]).toBe(Math.floor(value));
        expect(fraction).toBe(0.625);
        expect(packed[3]).toBe(0);
    }
);

test.each([-0.5, NaN, Infinity, 2 ** 44])(
    "rejects unsupported index %s",
    (value) => {
        expect(() => packFractionalIndex(value)).toThrow(
            "Fractional index positions"
        );
    }
);
