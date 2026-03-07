import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import createTitle from "./title.js";

describe("title config precedence", () => {
    test("group-title style applies by default when title.style is omitted", () => {
        const title = createTitle(
            {
                text: "Hello",
            },
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    style: {
                        "group-title": {
                            color: "rebeccapurple",
                            fontSize: 20,
                        },
                    },
                },
            ]
        );

        expect(/** @type {any} */ (title.mark).size).toBe(20);
        expect(/** @type {any} */ (title.mark).color).toBe("rebeccapurple");
    });

    test("title config and style config drive defaults", () => {
        const title = createTitle(
            {
                text: "Hello",
                style: "overlay",
            },
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    title: { fontSize: 16 },
                    style: {
                        overlay: {
                            fontSize: 24,
                            color: "red",
                        },
                    },
                },
            ]
        );

        expect(/** @type {any} */ (title.mark).size).toBe(24);
        expect(/** @type {any} */ (title.mark).color).toBe("red");
    });

    test("explicit title properties override config defaults", () => {
        const title = createTitle(
            {
                text: "Hello",
                style: "overlay",
                fontSize: 30,
                color: "blue",
            },
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    title: { fontSize: 16 },
                    style: {
                        overlay: {
                            fontSize: 24,
                            color: "red",
                        },
                    },
                },
            ]
        );

        expect(/** @type {any} */ (title.mark).size).toBe(30);
        expect(/** @type {any} */ (title.mark).color).toBe("blue");
    });
});
