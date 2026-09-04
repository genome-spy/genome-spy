// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { normalizeLinkArcFade } from "../immediate/linkFading.js";
import { createLinkArcFadeMask } from "./linkArcFadeMask.js";

describe("SVG link arc fade masks", () => {
    test("canonicalizes collinear chords independently of endpoints", () => {
        const first = normalizeLinkArcFade([10, 20], [80, 20], [5, 10]);
        const reversed = normalizeLinkArcFade([80, 20], [10, 20], [5, 10]);
        const disjoint = normalizeLinkArcFade([100, 20], [160, 20], [5, 10]);
        const shifted = normalizeLinkArcFade([10, 30], [80, 30], [5, 10]);

        expect(first?.key).toBe(reversed?.key);
        expect(first?.key).toBe(disjoint?.key);
        expect(first?.key).not.toBe(shifted?.key);
    });

    test("creates a symmetric smoothstep approximation across the chord", () => {
        const fade = normalizeLinkArcFade([10, 20], [80, 20], [5, 10]);
        if (!fade) {
            throw new Error("Expected a non-degenerate fade.");
        }
        const { gradient, mask } = createLinkArcFadeMask("fade", 100, 80, fade);
        const stops = Array.from(gradient.querySelectorAll("stop"));

        expect([
            gradient.getAttribute("y1"),
            gradient.getAttribute("y2"),
        ]).toEqual(["10", "30"]);
        expect(stops.map((stop) => stop.getAttribute("stop-opacity"))).toEqual([
            "0",
            "0.156",
            "0.5",
            "0.844",
            "1",
            "1",
            "0.844",
            "0.5",
            "0.156",
            "0",
        ]);
        expect(mask.querySelector("rect")?.getAttribute("fill")).toBe(
            "url(#fade-gradient)"
        );
    });
});
