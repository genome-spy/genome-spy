import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import {
    resolveBaseConfig,
    resolveImportedSpecConfig,
} from "./resolveConfig.js";
import { getBuiltInThemeBackground, resolveThemeSelection } from "./themes.js";

describe("resolveConfig", () => {
    test("resolves base config from defaults and theme", () => {
        const base = resolveBaseConfig({
            defaultConfig: INTERNAL_DEFAULT_CONFIG,
            theme: {
                mark: { color: "tomato" },
                point: { size: 200 },
            },
        });

        expect(base.mark.color).toBe("tomato");
        expect(base.point.size).toBe(200);
        expect(base.scale.nominalColorScheme).toBe("tableau10");
    });

    test("built-in theme is merged before user theme", () => {
        const base = resolveBaseConfig({
            defaultConfig: INTERNAL_DEFAULT_CONFIG,
            builtInTheme: {
                mark: { color: "steelblue" },
            },
            theme: {
                mark: { color: "tomato" },
            },
        });

        expect(base.mark.color).toBe("tomato");
    });

    test("unknown built-in theme throws", () => {
        expect(() =>
            resolveThemeSelection(/** @type {any} */ ("no-such-theme"))
        ).toThrow("Unknown theme");
    });

    test("additional built-in themes resolve", () => {
        const quartz = resolveThemeSelection("quartz");
        expect(quartz.mark.color).toBe("#ab5787");
        expect(quartz.axisY.domain).toBe(false);
        expect(quartz.axis.domain).toBe(true);
        expect(quartz.point.filled).toBe(false);

        const dark = resolveThemeSelection("dark");
        expect(dark.view.fill).toBe("#333");
        expect(dark.axis.labelColor).toBe("#fff");
        expect(dark.axis.grid).toBe(false);

        const fiveThirtyEight = resolveThemeSelection("fivethirtyeight");
        expect(fiveThirtyEight.mark.color).toBe("#30a2da");
        expect(fiveThirtyEight.axis.grid).toBe(true);
        expect(fiveThirtyEight.point.filled).toBe(true);

        const urbanInstitute = resolveThemeSelection("urbaninstitute");
        expect(urbanInstitute.mark.color).toBe("#1696d2");
        expect(urbanInstitute.axisY.gridColor).toBe("#DEDDDD");
        expect(urbanInstitute.axis.domain).toBe(true);
        expect(urbanInstitute.view.stroke).toBe("#000000");
        expect(urbanInstitute.view.strokeOpacity).toBe(0);
    });

    test("exposes built-in theme background for root resolution", () => {
        expect(getBuiltInThemeBackground("vegalite")).toBeUndefined();
        expect(getBuiltInThemeBackground("dark")).toBe("#333");
    });

    test("imported root config overrides import-site config", () => {
        const merged = resolveImportedSpecConfig(
            {
                mark: { color: "steelblue" },
                point: { opacity: 0.3 },
            },
            {
                mark: { color: "firebrick" },
                point: { size: 80 },
            }
        );

        expect(merged.mark.color).toBe("firebrick");
        expect(merged.point.opacity).toBe(0.3);
        expect(merged.point.size).toBe(80);
    });
});
