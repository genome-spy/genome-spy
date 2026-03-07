import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import { getConfiguredMarkDefaults } from "./markConfig.js";

describe("markConfig", () => {
    test("merges generic and mark-type buckets", () => {
        const defaults = getConfiguredMarkDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    mark: { color: "blue", xOffset: 3 },
                    point: { size: 11 },
                },
            ],
            "point",
            undefined
        );

        expect(defaults.color).toBe("blue");
        expect(defaults.xOffset).toBe(3);
        expect(defaults.size).toBe(11);
    });

    test("closest scope wins for same bucket", () => {
        const defaults = getConfiguredMarkDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                { point: { size: 7 } },
                { point: { size: 13 } },
            ],
            "point",
            undefined
        );

        expect(defaults.size).toBe(13);
    });

    test("style buckets merge after mark buckets across scopes", () => {
        const defaults = getConfiguredMarkDefaults(
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    mark: { color: "blue" },
                    point: { size: 11 },
                    style: {
                        emphasis: { color: "purple", opacity: 0.5 },
                    },
                },
                {
                    style: {
                        emphasis: { color: "black" },
                        override: { opacity: 0.8 },
                    },
                },
            ],
            "point",
            ["emphasis", "override"]
        );

        expect(defaults.color).toBe("black");
        expect(defaults.size).toBe(11);
        expect(defaults.opacity).toBe(0.8);
    });
});
