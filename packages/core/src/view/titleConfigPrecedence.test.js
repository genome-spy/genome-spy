import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import Padding from "./layout/padding.js";
import createTitle, { getTitleOverhang } from "./title.js";

function createFontContext() {
    return /** @type {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} */ ({
        fontManager: {
            getDefaultFont: () => ({
                metrics:
                    /** @type {import("../fonts/bmFontMetrics.js").BMFontMetrics} */ ({
                        common: { base: 10 },
                        capHeight: 7,
                        descent: 2,
                        measureWidth: (
                            /** @type {string} */ text,
                            /** @type {number} */ size
                        ) => text.length * size,
                    }),
            }),
            getFont: () => ({
                metrics:
                    /** @type {import("../fonts/bmFontMetrics.js").BMFontMetrics} */ ({
                        common: { base: 10 },
                        capHeight: 7,
                        descent: 2,
                        measureWidth: (
                            /** @type {string} */ text,
                            /** @type {number} */ size
                        ) => text.length * size,
                    }),
            }),
        },
    });
}

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

    test("top title reserves positive offset and text height", () => {
        const overhang = getTitleOverhang(
            {
                text: "Title",
                orient: "top",
                offset: 10,
                fontSize: 12,
                angle: 0,
            },
            createFontContext()
        );

        expect(overhang).toEqual(new Padding(21, 0, 0, 0));
    });

    test("left title reserves positive offset and rotated text height", () => {
        const overhang = getTitleOverhang(
            {
                text: "Track title",
                orient: "left",
                offset: 10,
                fontSize: 12,
                angle: -90,
            },
            createFontContext()
        );

        expect(overhang).toEqual(new Padding(0, 0, 0, 21));
    });

    test("negative offset title reserves no external space", () => {
        const overhang = getTitleOverhang(
            {
                text: "Overlay",
                orient: "top",
                offset: -10,
                fontSize: 12,
                angle: 0,
            },
            createFontContext()
        );

        expect(overhang).toEqual(Padding.zero());
    });

    test("title can render without reserving space", () => {
        const overhang = getTitleOverhang(
            {
                text: "Wild title",
                orient: "bottom",
                offset: 10,
                fontSize: 12,
                angle: 0,
                reserve: false,
            },
            createFontContext()
        );

        expect(overhang).toEqual(Padding.zero());
    });
});
