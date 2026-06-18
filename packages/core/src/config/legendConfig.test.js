import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import { getConfiguredLegendDefaults } from "./legendConfig.js";

describe("legendConfig", () => {
    test("internal defaults keep legends disabled", () => {
        expect(INTERNAL_DEFAULT_CONFIG.legend?.disable).toBe(true);
    });

    test("includes representative Vega-derived symbol legend defaults", () => {
        const defaults = getConfiguredLegendDefaults([INTERNAL_DEFAULT_CONFIG]);

        expect(defaults.orient).toBe("right");
        expect(defaults.direction).toBe("vertical");
        expect(defaults.labelOffset).toBe(4);
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

    test("explicit legend properties override style defaults", () => {
        const defaults = getConfiguredLegendDefaults(
            [INTERNAL_DEFAULT_CONFIG],
            { style: "track-bottom", orient: "right" }
        );

        expect(defaults.orient).toBe("right");
        expect(defaults.titleOrient).toBe("left");
    });
});
