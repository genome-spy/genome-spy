import { describe, expect, test } from "vitest";
import { buildSparsePathAtlasLayout } from "./sparsePathAtlasLayout.js";

describe("buildSparsePathAtlasLayout", () => {
    test("builds a compact deduplicated layout", () => {
        const square = "M-1-1H1V1H-1Z";
        const layout = buildSparsePathAtlasLayout([square, square]);

        expect(layout).toMatchObject({
            width: 130,
            height: 130,
            tileSize: 128,
            shapePixels: 48,
            spread: 32,
            uniquePathCount: 1,
            pathCount: 2,
        });
        expect(layout.jobs).toHaveLength(1);
        expect(layout.segments).toHaveLength(4);
        expect(layout.segmentData.byteLength).toBe(layout.segments.length * 64);
        expect(
            layout.segments.every((segment) =>
                [3, 5, 6].includes(segment.colorMask)
            )
        ).toBe(true);
        expect(
            layout.segments.every(
                (segment) =>
                    segment.startPseudoMask !== 0 &&
                    segment.endPseudoMask !== 0 &&
                    segment.startPseudoMask === segment.colorMask &&
                    segment.endPseudoMask === segment.colorMask
            )
        ).toBe(true);
        expect(Array.from(layout.entries.slice(0, 12))).toEqual(
            Array.from(layout.entries.slice(12, 24))
        );
        expect(Array.from(layout.entries.slice(4, 8))).toEqual([
            -0.5, -0.5, 0.5, 0.5,
        ]);
        expect(Array.from(layout.entries.slice(8, 12))).toEqual([1, 1, 1, 1]);
    });

    test("approximates cubic contours with quadratics", () => {
        const layout = buildSparsePathAtlasLayout([
            "M0-1C.8-1 1-.8 1 0C1 .8.8 1 0 1C-.8 1-1 .8-1 0C-1-.8-.8-1 0-1Z",
        ]);

        expect(layout.segments.length).toBeGreaterThan(4);
        expect(layout.segments.every((segment) => segment.kind === 1)).toBe(
            true
        );
        expect(
            layout.segments.every(
                (segment) =>
                    segment.startPseudoMask === 0 && segment.endPseudoMask === 0
            )
        ).toBe(true);
        expect(
            layout.segments.every(
                (segment) =>
                    Number.isFinite(segment.p1.x) &&
                    Number.isFinite(segment.p1.y)
            )
        ).toBe(true);
    });

    test("keeps tangent-continuous quadratic contours in one color", () => {
        const layout = buildSparsePathAtlasLayout([
            "M0-1Q1-1 1 0Q1 1 0 1Q-1 1-1 0Q-1-1 0-1Z",
        ]);
        const colors = new Set(
            layout.segments.map((segment) => segment.colorMask)
        );

        // A quadratic ends along p2-p1, not along its endpoint chord p2-p0.
        // Treating the chord as the tangent falsely turns every smooth join
        // into an MSDF color transition and rounds otherwise ordinary glyphs.
        expect(colors.size).toBe(1);
        expect([3, 5, 6]).toContain(layout.segments[0].colorMask);
    });

    test("bounds endpoint pseudo-distances with corner bisectors", () => {
        const layout = buildSparsePathAtlasLayout([
            "M-.35-1H.35V-.35H1V.35H.35V1H-.35V.35H-1V-.35H-.35Z",
        ]);
        const concaveStart = layout.segments[2];
        const convexStart = layout.segments[3];

        expect(concaveStart.startPseudoMask).toBe(concaveStart.colorMask);
        expect(concaveStart.startPseudoDomain.x).toBeCloseTo(Math.SQRT1_2);
        expect(concaveStart.startPseudoDomain.y).toBeCloseTo(Math.SQRT1_2);
        expect(convexStart.startPseudoDomain.x).toBeCloseTo(Math.SQRT1_2);
        expect(convexStart.startPseudoDomain.y).toBeCloseTo(Math.SQRT1_2);
    });

    test("computes directional miter padding per path", () => {
        const diamond = buildSparsePathAtlasLayout(["M0-1L1 0 0 1-1 0Z"]);
        for (const padding of diamond.entries.slice(8, 12)) {
            expect(padding).toBeCloseTo(Math.SQRT2);
        }

        const triangle = buildSparsePathAtlasLayout(["M0-1L1 1H-1Z"]);
        const [, top, , bottom] = triangle.entries.slice(8, 12);
        expect(top).toBeGreaterThan(bottom);
        expect(top).toBeCloseTo(Math.sqrt(5));
    });

    test("uses a shared normalization span for font-like paths", () => {
        const layout = buildSparsePathAtlasLayout(["M0 0H100V50H0Z"], {
            normalizationSpan: 1000,
        });

        const bounds = Array.from(layout.entries.slice(4, 8));
        expect(bounds[0]).toBeCloseTo(-0.05);
        expect(bounds[1]).toBeCloseTo(-0.025);
        expect(bounds[2]).toBeCloseTo(0.05);
        expect(bounds[3]).toBeCloseTo(0.025);
        expect(layout.segments[0].p0.x).toBeCloseTo(62.6);
        expect(layout.segments[0].p0.y).toBeCloseTo(63.8);
    });

    test("packs narrow font-like paths into variable rectangles", () => {
        const layout = buildSparsePathAtlasLayout(
            ["M0 0H100V50H0Z", "M0 0H1000V1000H0Z"],
            {
                normalizationSpan: 1000,
                tightPacking: true,
                maxAtlasWidth: 256,
            }
        );

        expect(layout).toMatchObject({
            width: 217,
            height: 130,
            maxSlotWidth: 130,
            maxSlotHeight: 130,
        });
        expect(layout.jobs[0]).toMatchObject({
            slotWidth: 87,
            slotHeight: 85,
            tileWidth: 85,
            tileHeight: 83,
        });
        const jobs = new DataView(layout.jobData);
        expect(jobs.getUint32(16, true)).toBe(87);
        expect(jobs.getUint32(20, true)).toBe(85);
        expect(layout.width * layout.height).toBeLessThan(260 * 130);
    });

    test("rejects open contours and invalid range geometry", () => {
        expect(() => buildSparsePathAtlasLayout(["M0 0Q.5 1 1 0"])).toThrow(
            /closed contours/i
        );
        expect(() =>
            buildSparsePathAtlasLayout(["M-1-1H1V1H-1Z"], {
                tileSize: 32,
                shapePadding: 10,
                spread: 11,
            })
        ).toThrow(/invalid sparse path atlas dimensions/i);
    });
});
