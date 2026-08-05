import { describe, expect, test } from "vitest";

import Rectangle from "../layout/rectangle.js";
import { translateLegendCoords } from "./legendLayout.js";

describe("legend layout helpers", () => {
    describe("translateLegendCoords", () => {
        test("places a right-oriented legend next to the viewport", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 80,
                getOffset: () => 12,
            });

            const coords = translateLegendCoords(
                Rectangle.create(10, 20, 300, 200),
                "right",
                legendView
            );

            expect(coords.x).toBe(322);
            expect(coords.y).toBe(20);
            expect(coords.width).toBe(80);
            expect(coords.height).toBe(200);
        });

        test("centers a right legend stack along the viewport edge", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 80,
                getParallelSize: () => 60,
                getOffset: () => 12,
                getAnchor: () => "middle",
            });

            const coords = translateLegendCoords(
                Rectangle.create(10, 20, 300, 200),
                "right",
                legendView
            );

            expect(coords.x).toBe(322);
            expect(coords.y).toBe(90);
            expect(coords.width).toBe(80);
            expect(coords.height).toBe(60);
        });

        test("end-anchors a top legend stack", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 30,
                getParallelSize: () => 120,
                getOffset: () => 10,
                getAnchor: () => "end",
            });

            const coords = translateLegendCoords(
                Rectangle.create(10, 20, 300, 200),
                "top",
                legendView
            );

            expect(coords.x).toBe(190);
            expect(coords.y).toBe(-20);
            expect(coords.width).toBe(120);
            expect(coords.height).toBe(30);
        });

        test("centers an oversized stack without clamping", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 30,
                getParallelSize: () => 400,
                getOffset: () => 0,
                getAnchor: () => "middle",
            });

            const coords = translateLegendCoords(
                Rectangle.create(10, 20, 300, 200),
                "top",
                legendView
            );

            expect(coords.x).toBe(-40);
            expect(coords.width).toBe(400);
        });

        test("places a top-right legend inside the viewport", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 80,
                getOffset: () => 12,
                getAnchor: () => "middle",
            });

            const coords = translateLegendCoords(
                Rectangle.create(10, 20, 300, 200),
                "top-right",
                legendView
            );

            expect(coords.x).toBe(218);
            expect(coords.y).toBe(32);
            expect(coords.width).toBe(80);
            expect(coords.height).toBe(176);
        });

        test("places a bottom-right legend inside the viewport", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 80,
                getOffset: () => 12,
                getParallelSize: () => 60,
            });

            const coords = translateLegendCoords(
                Rectangle.create(10, 20, 300, 200),
                "bottom-right",
                legendView
            );

            expect(coords.x).toBe(218);
            expect(coords.y).toBe(148);
            expect(coords.width).toBe(80);
            expect(coords.height).toBe(60);
        });

        test("places a top-right horizontal legend inside the viewport", () => {
            const legendView = /** @type {any} */ ({
                getPerpendicularSize: () => 24,
                getParallelSize: () => 180,
                getWidth: () => 180,
                getHeight: () => 24,
                getOffset: () => 12,
            });

            const coords = translateLegendCoords(
                Rectangle.create(10, 20, 300, 200),
                "top-right",
                legendView
            );

            expect(coords.x).toBe(118);
            expect(coords.y).toBe(32);
            expect(coords.width).toBe(180);
            expect(coords.height).toBe(24);
        });
    });
});
