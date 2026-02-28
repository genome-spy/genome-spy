import { describe, expect, test } from "vitest";
import {
    getConfiguredStyleConfig,
    getConfiguredTitleConfig,
} from "./titleConfig.js";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";

describe("titleConfig", () => {
    test("merges title config across scopes", () => {
        const config = getConfiguredTitleConfig([
            INTERNAL_DEFAULT_CONFIG,
            { title: { fontSize: 20 } },
            { title: { color: "crimson" } },
        ]);

        expect(config.fontSize).toBe(20);
        expect(config.color).toBe("crimson");
        expect(config.anchor).toBe("middle");
    });

    test("merges named style config across scopes", () => {
        const style = getConfiguredStyleConfig(
            [
                INTERNAL_DEFAULT_CONFIG,
                { style: { overlay: { fontSize: 18 } } },
                { style: { overlay: { color: "seagreen" } } },
            ],
            "overlay"
        );

        expect(style.fontSize).toBe(18);
        expect(style.color).toBe("seagreen");
        expect(style.anchor).toBe("start");
    });

    test("merges multiple style names in order", () => {
        const style = getConfiguredStyleConfig(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    style: {
                        "group-title": { fontSize: 18, color: "steelblue" },
                        emphasis: { color: "seagreen" },
                    },
                },
            ],
            ["group-title", "emphasis"]
        );

        expect(style.fontSize).toBe(18);
        expect(style.color).toBe("seagreen");
    });
});
