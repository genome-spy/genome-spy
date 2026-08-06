// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import linkShapesSpec from "../../../../../examples/docs/grammar/mark/link/link-shapes-and-orientations.json" with { type: "json" };
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../index.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

describe("SVG link renderer", () => {
    test("exports all link shapes as native paths", async () => {
        const { view } = await createHeadlessEngine(
            /** @type {import("../../spec/root.js").RootSpec} */ (
                structuredClone(linkShapesSpec)
            ),
            {
                contextOptions: {
                    baseConfig,
                    viewFactoryOptions: { wrapRoot: true },
                },
            }
        );

        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 800,
            logicalHeight: 400,
        });
        const paths = svg.querySelectorAll('[data-mark-type="link"] path');

        expect(paths).toHaveLength(8);
        expect(
            Array.from(paths).every((path) =>
                /^M .* C /.test(path.getAttribute("d"))
            )
        ).toBe(true);
        expect(svg.querySelector("image")).toBeNull();
    });

    test("resolves expression-valued link properties", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "link",
                linkShape: { expr: "'line'" },
                orient: { expr: "'horizontal'" },
                arcHeightFactor: { expr: "2" },
                minArcHeight: { expr: "3" },
                maxChordLength: { expr: "100" },
                clampApex: { expr: "true" },
                arcFadingDistance: { expr: "false" },
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
            background: null,
        });
        const path = svg.querySelector('[data-mark-type="link"] path');

        expect(path?.getAttribute("d")).toBe("M 40 50 C 100 50 100 50 160 50");
        expect(warnings).toEqual([]);
    });

    test("warns and exports when a property is unsupported", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{}] },
            mark: {
                type: "link",
                linkShape: "arc",
                arcFadingDistance: [10, 20],
            },
            encoding: {
                x: { value: 0.2 },
                x2: { value: 0.8 },
                y: { value: 0.5 },
                y2: { value: 0.5 },
                color: { value: "black" },
            },
        });

        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 200,
            logicalHeight: 100,
        });

        expect(
            svg.querySelector('[data-mark-type="link"] path')
        ).not.toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("ignored unsupported link arc fading");
        expect(warnings[0]).toContain("View:");
    });
});
