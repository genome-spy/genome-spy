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

    test("implicit mark-type style applies when mark.style is omitted", async () => {
        const styled = /** @type {UnitView} */ (
            await create(
                {
                    config: {
                        point: { size: 10, color: "orange" },
                        style: {
                            point: { size: 35, color: "teal" },
                        },
                    },
                    mark: "point",
                },
                UnitView
            )
        );

        expect(/** @type {any} */ (styled.mark.properties).size).toBe(35);
        expect(styled.mark.properties.color).toBe("teal");

        const explicit = /** @type {UnitView} */ (
            await create(
                {
                    config: {
                        style: {
                            point: { color: "teal" },
                            emphasis: { color: "firebrick" },
                        },
                    },
                    mark: {
                        type: "point",
                        style: "emphasis",
                    },
                },
                UnitView
            )
        );

        expect(explicit.mark.properties.color).toBe("firebrick");
    });

    test("tick uses config.tick instead of config.rule", async () => {
        const view = /** @type {UnitView} */ (
            await create(
                {
                    config: {
                        rule: {
                            color: "orange",
                        },
                        tick: {
                            color: "seagreen",
                            thickness: 7,
                        },
                    },
                    mark: {
                        type: "tick",
                        orient: "vertical",
                    },
                    encoding: {
                        x: { field: "value", type: "quantitative" },
                    },
                },
                UnitView
            )
        );

        expect(view.mark.properties.color).toBe("seagreen");
        expect(/** @type {any} */ (view.mark.properties).thickness).toBe(7);
    });
});
