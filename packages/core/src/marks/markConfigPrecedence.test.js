import { describe, expect, test } from "vitest";
import UnitView from "../view/unitView.js";
import { create } from "../view/testUtils.js";

describe("mark config precedence", () => {
    test("default mark values are sourced from internal config", async () => {
        const point = await create({ mark: "point" }, UnitView);
        const rect = await create({ mark: "rect" }, UnitView);
        const rule = await create(
            {
                mark: "rule",
                encoding: {
                    x: { value: 0 },
                },
            },
            UnitView
        );
        const text = await create({ mark: "text" }, UnitView);

        expect(/** @type {any} */ (point.mark.properties).size).toBe(100);
        expect(/** @type {any} */ (rect.mark.properties).minOpacity).toBe(1);
        expect(/** @type {any} */ (rule.mark.properties).strokeCap).toBe(
            "butt"
        );
        expect(/** @type {any} */ (text.mark.properties).size).toBe(11);
    });

    test("config.mark and config.<markType> override defaults", async () => {
        const view = await create(
            {
                config: {
                    mark: {
                        color: "orange",
                        xOffset: 3,
                    },
                    point: {
                        size: 25,
                        opacity: 0.35,
                    },
                },
                mark: "point",
            },
            UnitView
        );

        expect(view.mark.properties.color).toBe("orange");
        expect(view.mark.properties.xOffset).toBe(3);
        expect(/** @type {any} */ (view.mark.properties).size).toBe(25);
        expect(view.mark.properties.opacity).toBe(0.35);
    });

    test("explicit mark properties override config", async () => {
        const view = await create(
            {
                config: {
                    mark: {
                        color: "orange",
                    },
                    point: {
                        size: 25,
                    },
                },
                mark: {
                    type: "point",
                    color: "purple",
                    size: 7,
                },
            },
            UnitView
        );

        expect(view.mark.properties.color).toBe("purple");
        expect(/** @type {any} */ (view.mark.properties).size).toBe(7);
    });

    test("mark style applies after mark buckets and before explicit props", async () => {
        const configured = /** @type {UnitView} */ (
            await create(
                {
                    config: {
                        mark: { color: "orange" },
                        point: { size: 10 },
                        style: {
                            emphasis: {
                                color: "teal",
                                opacity: 0.4,
                                size: 20,
                            },
                            override: { color: "crimson" },
                        },
                    },
                    mark: {
                        type: "point",
                        style: ["emphasis", "override"],
                    },
                },
                UnitView
            )
        );

        expect(configured.mark.properties.color).toBe("crimson");
        expect(configured.mark.properties.opacity).toBe(0.4);
        expect(/** @type {any} */ (configured.mark.properties).size).toBe(20);

        const explicit = /** @type {UnitView} */ (
            await create(
                {
                    config: {
                        style: {
                            emphasis: { color: "teal" },
                        },
                    },
                    mark: {
                        type: "point",
                        style: "emphasis",
                        color: "black",
                    },
                },
                UnitView
            )
        );

        expect(explicit.mark.properties.color).toBe("black");
    });

    test("vegalite theme provides point defaults while explicit mark props still win", async () => {
        const themed = /** @type {UnitView} */ (
            await create(
                {
                    theme: "vegalite",
                    mark: "point",
                },
                UnitView
            )
        );

        expect(themed.mark.properties.color).toBe("#4c78a8");
        expect(/** @type {any} */ (themed.mark.properties).filled).toBe(false);
        expect(/** @type {any} */ (themed.mark.properties).size).toBe(30);

        const explicit = /** @type {UnitView} */ (
            await create(
                {
                    theme: "vegalite",
                    mark: {
                        type: "point",
                        filled: true,
                        size: 50,
                    },
                },
                UnitView
            )
        );

        expect(/** @type {any} */ (explicit.mark.properties).filled).toBe(true);
        expect(/** @type {any} */ (explicit.mark.properties).size).toBe(50);
    });
});
