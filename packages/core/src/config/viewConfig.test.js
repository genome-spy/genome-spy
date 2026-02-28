import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import { getConfiguredViewBackground } from "./viewConfig.js";

describe("viewConfig", () => {
    test("merges view config with explicit view overrides", () => {
        const background = getConfiguredViewBackground(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    view: {
                        fill: "gold",
                        stroke: "black",
                    },
                },
                {
                    view: {
                        fillOpacity: 0.4,
                    },
                },
            ],
            {
                fill: "tomato",
            }
        );

        expect(background.fill).toBe("tomato");
        expect(background.stroke).toBe("black");
        expect(background.fillOpacity).toBe(0.4);
    });
});
