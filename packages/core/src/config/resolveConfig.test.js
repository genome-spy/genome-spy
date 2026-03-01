import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import {
    resolveBaseConfig,
    resolveImportedSpecConfig,
    resolveLocalConfigScope,
    resolveViewConfig,
} from "./resolveConfig.js";
import { resolveThemeBackground } from "./themes.js";

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

    test("resolves hierarchical view config using closest scope", () => {
        const base = resolveBaseConfig({
            defaultConfig: INTERNAL_DEFAULT_CONFIG,
        });
        const parent = resolveViewConfig(base, undefined, {
            mark: { color: "gray" },
            point: { size: 123 },
        });
        const child = resolveViewConfig(base, parent, {
            mark: { color: "orange" },
        });

        expect(child.mark.color).toBe("orange");
        expect(child.point.size).toBe(123);
        expect(child.scale.nominalColorScheme).toBe("tableau10");
    });

    test("applies built-in theme before local config in a scope", () => {
        const scope = resolveLocalConfigScope("vegalite", {
            axis: {
                domain: true,
            },
        });

        expect(scope.axis.grid).toBe(false);
        expect(scope.axis.domain).toBe(true);
        expect(scope.axisQuantitative.grid).toBe(true);
    });

    test("unknown built-in theme throws", () => {
        expect(() =>
            resolveLocalConfigScope(
                /** @type {any} */ ("no-such-theme"),
                undefined
            )
        ).toThrow("Unknown theme");
    });

    test("additional built-in themes resolve", () => {
        const quartz = resolveLocalConfigScope("quartz");
        expect(quartz.mark.color).toBe("#ab5787");
        expect(quartz.axisY.domain).toBe(false);
        expect(quartz.axis.domain).toBe(true);
        expect(quartz.point.filled).toBe(false);

        const dark = resolveLocalConfigScope("dark");
        expect(dark.view.fill).toBe("#333");
        expect(dark.axis.labelColor).toBe("#fff");
        expect(dark.axis.grid).toBe(false);

        const fiveThirtyEight = resolveLocalConfigScope("fivethirtyeight");
        expect(fiveThirtyEight.mark.color).toBe("#30a2da");
        expect(fiveThirtyEight.axis.grid).toBe(true);
        expect(fiveThirtyEight.point.filled).toBe(false);

        const urbanInstitute = resolveLocalConfigScope("urbaninstitute");
        expect(urbanInstitute.mark.color).toBe("#1696d2");
        expect(urbanInstitute.axisY.gridColor).toBe("#DEDDDD");
        expect(urbanInstitute.axis.domain).toBe(true);
    });

    test("resolves canvas background from built-in theme selection", () => {
        expect(resolveThemeBackground(undefined)).toBeUndefined();
        expect(resolveThemeBackground("dark")).toBe("#333");
        expect(resolveThemeBackground(["vegalite", "dark"])).toBe("#333");
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
