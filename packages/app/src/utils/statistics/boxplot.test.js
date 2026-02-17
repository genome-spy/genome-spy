// @ts-check
import { describe, it, expect } from "vitest";
import { boxplotStats } from "./boxplot.js";

describe("boxplotStats", () => {
    // Ensure basic Tukey stats and outlier detection works on a small sample.
    it("computes Tukey stats and identifies outliers", () => {
        const data = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 100 }];
        const res = boxplotStats(data, (d) => d.x);
        const s = res.statistics;
        expect(s).not.toBeNull();
        expect(s.n).toBe(5);
        expect(s.nValid).toBe(5);
        expect(s.q1).toBe(2);
        expect(s.median).toBe(3);
        expect(s.q3).toBe(4);
        expect(s.iqr).toBe(2);
        expect(s.lowerFence).toBe(2 - 1.5 * 2);
        expect(s.upperFence).toBe(4 + 1.5 * 2);
        expect(s.lowerWhisker).toBe(1);
        expect(s.upperWhisker).toBe(4);
        expect(s.min).toBe(1);
        expect(s.max).toBe(100);
        expect(res.outliers).toHaveLength(1);
        expect(res.outliers[0]).toBe(data[4]);
    });

    // coef=0 should set whiskers to extremes and return no outliers (R behavior).
    it("with coef=0 uses extremes and returns no outliers", () => {
        const data = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 100 }];
        const res = boxplotStats(data, (d) => d.x, { coef: 0 });
        const s = res.statistics;
        expect(s).not.toBeNull();
        expect(s.lowerWhisker).toBe(1);
        expect(s.upperWhisker).toBe(100);
        expect(res.outliers).toHaveLength(0);
    });

    // Non-finite and undefined values dropped; null converts to 0 (finite, included).
    it("drops Infinity and NaN by default, includes null as 0", () => {
        const data = [
            { x: 1 },
            { x: Infinity },
            { x: NaN },
            { x: undefined },
            { x: 3 },
        ];
        const res = boxplotStats(data, (d) => d.x);
        const s = res.statistics;
        expect(s).not.toBeNull();
        expect(s.n).toBe(5);
        expect(s.nValid).toBe(2);
        expect(s.min).toBe(1);
        expect(s.max).toBe(3);
    });

    // With dropNaN=false, non-finite values are included (but stats can include NaN).
    it("keeps non-finite values when dropNaN=false", () => {
        const data = [{ x: 1 }, { x: 2 }, { x: NaN }];
        const res = boxplotStats(data, (d) => d.x, { dropNaN: false });
        const s = res.statistics;
        // All three values are included, but NaN in sorting/quantile leads to NaN min/max.
        expect(s).not.toBeNull();
        expect(s.n).toBe(3);
        expect(s.nValid).toBe(3);
        expect(s.min).toBe(1);
        expect(Number.isNaN(s.max)).toBe(true);
    });
});
