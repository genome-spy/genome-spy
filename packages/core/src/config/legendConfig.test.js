import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import {
    getConfiguredLegendDefaults,
    getConfiguredLegendRegionDirection,
} from "./legendConfig.js";

describe("legendConfig", () => {
    test("internal defaults keep legends visible", () => {
        expect(INTERNAL_DEFAULT_CONFIG.legend?.disable).toBe(false);
    });

    test("includes representative Vega-derived symbol legend defaults", () => {
        const defaults = getConfiguredLegendDefaults([INTERNAL_DEFAULT_CONFIG]);

        expect(defaults.orient).toBe("right");
        expect(defaults.placement).toBe("local");
        expect(defaults.direction).toBe("vertical");
        expect(defaults.labelOffset).toBe(4);
        expect(defaults.gradientThickness).toBe(12);
        expect(defaults.gradientOpacity).toBe(1);
        expect(defaults.gradientStrokeWidth).toBe(0);
        expect(defaults.tickCount).toBe(5);
        expect(defaults.symbolType).toBe("circle");
        expect(defaults.titleOrient).toBe("top");
    });

    test("closest config scope wins", () => {
        const defaults = getConfiguredLegendDefaults([
            INTERNAL_DEFAULT_CONFIG,
            { legend: { labelLimit: 80, rowPadding: 4 } },
            { legend: { labelLimit: 120 } },
        ]);

        expect(defaults.labelLimit).toBe(120);
        expect(defaults.rowPadding).toBe(4);
    });

    test("explicit legend properties override config defaults", () => {
        const defaults = getConfiguredLegendDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                { legend: { orient: "left", labelLimit: 80 } },
            ],
            { orient: "bottom", labelLimit: 40 }
        );

        expect(defaults.orient).toBe("bottom");
        expect(defaults.labelLimit).toBe(40);
    });

    test("explicit placement overrides inherited placement", () => {
        const defaults = getConfiguredLegendDefaults(
            [INTERNAL_DEFAULT_CONFIG, { legend: { placement: "root" } }],
            { placement: "local" }
        );

        expect(defaults.placement).toBe("local");
    });

    test("track defaults apply between built-in and user legend config", () => {
        const trackDefaults = getConfiguredLegendDefaults(
            [INTERNAL_DEFAULT_CONFIG],
            undefined,
            { track: true }
        );
        const userDefaults = getConfiguredLegendDefaults(
            [INTERNAL_DEFAULT_CONFIG, { legend: { orient: "left" } }],
            undefined,
            { track: true }
        );

        expect(trackDefaults.orient).toBe("bottom");
        expect(trackDefaults.titleOrient).toBe("left");
        expect(userDefaults.orient).toBe("left");
        expect(userDefaults.titleOrient).toBe("left");
    });

    test("built-in track-bottom style configures compact bottom legends", () => {
        const defaults = getConfiguredLegendDefaults(
            [INTERNAL_DEFAULT_CONFIG],
            { style: "track-bottom" }
        );

        expect(defaults.orient).toBe("bottom");
        expect(defaults.titleOrient).toBe("left");
        expect(defaults.spacing).toBe(3);
        expect(defaults.offset).toBe(3);
    });

    test("config legend style resolves inherited style buckets", () => {
        const defaults = getConfiguredLegendDefaults([
            INTERNAL_DEFAULT_CONFIG,
            { legend: { style: "track-bottom" } },
        ]);

        expect(defaults.orient).toBe("bottom");
        expect(defaults.titleOrient).toBe("left");
        expect(defaults.spacing).toBe(3);
        expect(defaults.offset).toBe(3);
    });

    test("null config legend style resets inherited style defaults", () => {
        const defaults = getConfiguredLegendDefaults([
            INTERNAL_DEFAULT_CONFIG,
            { legend: { style: "track-bottom" } },
            { legend: { style: null } },
        ]);

        expect(defaults.orient).toBe("right");
        expect(defaults.titleOrient).toBe("top");
        expect(defaults.spacing).toBe(10);
        expect(defaults.offset).toBe(18);
    });

    test("local style buckets override inherited config legend styles", () => {
        const defaults = getConfiguredLegendDefaults([
            INTERNAL_DEFAULT_CONFIG,
            {
                legend: { style: "track-bottom" },
                style: {
                    "track-bottom": { orient: "left", spacing: 7 },
                },
            },
        ]);

        expect(defaults.orient).toBe("left");
        expect(defaults.titleOrient).toBe("left");
        expect(defaults.spacing).toBe(7);
    });

    test("explicit legend properties override style defaults", () => {
        const defaults = getConfiguredLegendDefaults(
            [INTERNAL_DEFAULT_CONFIG],
            { style: "track-bottom", orient: "right" }
        );

        expect(defaults.orient).toBe("right");
        expect(defaults.titleOrient).toBe("left");
    });

    test("uses orientation-dependent legend region directions", () => {
        expect(
            getConfiguredLegendRegionDirection(
                [INTERNAL_DEFAULT_CONFIG],
                "left"
            )
        ).toBe("vertical");
        expect(
            getConfiguredLegendRegionDirection([INTERNAL_DEFAULT_CONFIG], "top")
        ).toBe("horizontal");
        expect(
            getConfiguredLegendRegionDirection(
                [INTERNAL_DEFAULT_CONFIG],
                "bottom-right"
            )
        ).toBe("horizontal");
    });

    test("orientation-specific region direction overrides the general direction", () => {
        const scopes = [
            INTERNAL_DEFAULT_CONFIG,
            {
                legend: {
                    layout: {
                        direction: "vertical",
                        top: { direction: "horizontal" },
                    },
                },
            },
        ];

        expect(getConfiguredLegendRegionDirection(scopes, "right")).toBe(
            "vertical"
        );
        expect(getConfiguredLegendRegionDirection(scopes, "top")).toBe(
            "horizontal"
        );
    });

    test("closest region layout scope wins", () => {
        const scopes = [
            INTERNAL_DEFAULT_CONFIG,
            { legend: { layout: { top: { direction: "vertical" } } } },
            { legend: { layout: { top: { direction: "horizontal" } } } },
        ];

        expect(getConfiguredLegendRegionDirection(scopes, "top")).toBe(
            "horizontal"
        );
    });

    test("region layout does not leak into individual legend defaults", () => {
        const defaults = getConfiguredLegendDefaults([
            INTERNAL_DEFAULT_CONFIG,
            { legend: { layout: { direction: "horizontal" } } },
        ]);

        expect(defaults).not.toHaveProperty("layout");
    });
});
