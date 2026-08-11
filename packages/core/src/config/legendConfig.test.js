import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import {
    getConfiguredLegendDefaults,
    getConfiguredLegendRegionLayout,
} from "./legendConfig.js";

describe("legendConfig", () => {
    test("internal defaults keep legends visible", () => {
        expect(INTERNAL_DEFAULT_CONFIG.legend?.disable).toBe(false);
    });

    test("includes representative Vega-derived symbol legend defaults", () => {
        const defaults = getConfiguredLegendDefaults([INTERNAL_DEFAULT_CONFIG]);

        expect(defaults.orient).toBe("right");
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
        expect(trackDefaults.direction).toBe("horizontal");
        expect(trackDefaults.titleOrient).toBe("left");
        expect(userDefaults.orient).toBe("left");
        expect(userDefaults.titleOrient).toBe("left");
    });

    test("built-in track-bottom-legend style configures compact bottom legends", () => {
        const defaults = getConfiguredLegendDefaults(
            [INTERNAL_DEFAULT_CONFIG],
            { style: "track-bottom-legend" }
        );

        expect(defaults.orient).toBe("bottom");
        expect(defaults.direction).toBe("horizontal");
        expect(defaults.titleOrient).toBe("left");
        expect(defaults.spacing).toBe(15);
        expect(defaults.offset).toBe(3);
    });

    test("config legend style resolves inherited style buckets", () => {
        const defaults = getConfiguredLegendDefaults([
            INTERNAL_DEFAULT_CONFIG,
            { legend: { style: "track-bottom-legend" } },
        ]);

        expect(defaults.orient).toBe("bottom");
        expect(defaults.titleOrient).toBe("left");
        expect(defaults.spacing).toBe(15);
        expect(defaults.offset).toBe(3);
    });

    test("null config legend style resets inherited style defaults", () => {
        const defaults = getConfiguredLegendDefaults([
            INTERNAL_DEFAULT_CONFIG,
            { legend: { style: "track-bottom-legend" } },
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
                legend: { style: "track-bottom-legend" },
                style: {
                    "track-bottom-legend": { orient: "left", spacing: 7 },
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
            { style: "track-bottom-legend", orient: "right" }
        );

        expect(defaults.orient).toBe("right");
        expect(defaults.titleOrient).toBe("left");
    });

    test("retains track-bottom as a compatibility alias", () => {
        const defaults = getConfiguredLegendDefaults(
            [INTERNAL_DEFAULT_CONFIG],
            { style: "track-bottom" }
        );

        expect(defaults.orient).toBe("bottom");
        expect(defaults.direction).toBe("horizontal");
        expect(defaults.titleOrient).toBe("left");
    });

    test("uses orientation-dependent region defaults", () => {
        expect(
            getConfiguredLegendRegionLayout([INTERNAL_DEFAULT_CONFIG], "left")
        ).toEqual({ anchor: "start", direction: "vertical", wrap: true });
        expect(
            getConfiguredLegendRegionLayout([INTERNAL_DEFAULT_CONFIG], "top")
        ).toEqual({ anchor: "start", direction: "horizontal", wrap: true });
        expect(
            getConfiguredLegendRegionLayout(
                [INTERNAL_DEFAULT_CONFIG],
                "bottom-right"
            )
        ).toEqual({ anchor: "start", direction: "horizontal", wrap: false });
    });

    test("orientation-specific region layout overrides general layout", () => {
        /** @type {import("../spec/config.js").GenomeSpyConfig[]} */
        const scopes = [
            INTERNAL_DEFAULT_CONFIG,
            {
                legend: {
                    layout: {
                        anchor: "middle",
                        direction: "vertical",
                        wrap: false,
                        top: {
                            anchor: "end",
                            direction: "horizontal",
                            wrap: true,
                        },
                    },
                },
            },
        ];

        expect(getConfiguredLegendRegionLayout(scopes, "right")).toEqual({
            anchor: "middle",
            direction: "vertical",
            wrap: false,
        });
        expect(getConfiguredLegendRegionLayout(scopes, "top")).toEqual({
            anchor: "end",
            direction: "horizontal",
            wrap: true,
        });
    });

    test("closest region layout scope wins", () => {
        /** @type {import("../spec/config.js").GenomeSpyConfig[]} */
        const scopes = [
            INTERNAL_DEFAULT_CONFIG,
            { legend: { layout: { top: { anchor: "middle" } } } },
            { legend: { layout: { top: { anchor: "end" } } } },
        ];

        expect(getConfiguredLegendRegionLayout(scopes, "top")).toEqual({
            anchor: "end",
            direction: "horizontal",
            wrap: true,
        });
    });

    test("region layout does not leak into individual legend defaults", () => {
        const defaults = getConfiguredLegendDefaults([
            INTERNAL_DEFAULT_CONFIG,
            { legend: { layout: { direction: "horizontal" } } },
        ]);

        expect(defaults).not.toHaveProperty("layout");
    });
});
