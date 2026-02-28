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
});
