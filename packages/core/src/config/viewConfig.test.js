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

    test("applies implicit cell style defaults", () => {
        const background = getConfiguredViewBackground([
            {
                style: {
                    cell: {
                        fill: "mintcream",
                        stroke: "slategray",
                        strokeWidth: 2,
                    },
                },
            },
        ]);

        expect(background.fill).toBe("mintcream");
        expect(background.stroke).toBe("slategray");
        expect(background.strokeWidth).toBe(2);
    });

    test("explicit view style augments implicit cell style", () => {
        const background = getConfiguredViewBackground(
            [
                {
                    style: {
                        cell: {
                            fill: "oldlace",
                            stroke: "gray",
                        },
                        emphasis: {
                            stroke: "black",
                            strokeOpacity: 0.6,
                        },
                    },
                },
            ],
            {
                style: "emphasis",
            }
        );

        expect(background.fill).toBe("oldlace");
        expect(background.stroke).toBe("black");
        expect(background.strokeOpacity).toBe(0.6);
    });

    test("explicit view properties override style and config defaults", () => {
        const background = getConfiguredViewBackground(
            [
                {
                    view: {
                        fill: "gold",
                        stroke: "black",
                    },
                    style: {
                        cell: {
                            fill: "lightgray",
                            stroke: "darkgray",
                        },
                        emphasis: {
                            fill: "purple",
                        },
                    },
                },
            ],
            {
                style: "emphasis",
                fill: "tomato",
            }
        );

        expect(background.fill).toBe("tomato");
        expect(background.stroke).toBe("darkgray");
    });
});
