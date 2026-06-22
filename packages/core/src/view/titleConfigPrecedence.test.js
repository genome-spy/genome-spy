import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import Padding from "./layout/padding.js";
import TitleView, { getTitleOverhang } from "./titleView.js";
import ContainerView from "./containerView.js";
import { createTestViewContext } from "./testUtils.js";

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

/**
 * @param {string | import("../spec/title.js").Title} title
 * @param {import("../spec/config.js").GenomeSpyConfig[]} [configScopes]
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} [fontContext]
 * @returns {import("../spec/view.js").UnitSpec[]}
 */
function createTitleUnits(title, configScopes = [], fontContext) {
    return Array.from(createTitleView(title, configScopes, fontContext)).map(
        (view) => view.spec
    );
}

/**
 * @param {string | import("../spec/title.js").Title} title
 * @param {import("../spec/config.js").GenomeSpyConfig[]} [configScopes]
 * @param {{ fontManager: import("../fonts/textMetrics.js").FontManagerLike }} [fontContext]
 * @returns {TitleView}
 */
function createTitleView(title, configScopes = [], fontContext) {
    const context = createTestViewContext();
    if (fontContext) {
        context.fontManager = /** @type {any} */ (fontContext.fontManager);
    }

    const parent = new ContainerView(
        { layer: [] },
        context,
        null,
        null,
        "parent"
    );
    const titleView = TitleView.create(
        title,
        configScopes,
        context,
        parent,
        parent,
        "title"
    );
    if (!titleView) {
        throw new Error("Expected the title to produce a TitleView.");
    }

    return titleView;
}

/**
 * @param {import("../spec/view.js").UnitSpec} spec
 * @returns {import("../spec/mark.js").TextProps}
 */
function getTextMark(spec) {
    expect(typeof spec.mark).toBe("object");
    return /** @type {import("../spec/mark.js").TextProps} */ (spec.mark);
}

describe("title config precedence", () => {
    test("group-title style applies by default when title.style is omitted", () => {
        const [title] = createTitleUnits(
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
        const [title] = createTitleUnits(
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
        const [title] = createTitleUnits(
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

    test("group-subtitle style applies to subtitle text", () => {
        const [, subtitle] = createTitleUnits(
            {
                text: "Hello",
                subtitle: "World",
            },
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    style: {
                        "group-subtitle": {
                            color: "dimgray",
                            fontSize: 11,
                        },
                    },
                },
            ]
        );

        expect(getTextMark(subtitle).size).toBe(11);
        expect(getTextMark(subtitle).color).toBe("dimgray");
    });

    test("subtitle title config overrides default subtitle style", () => {
        const [, subtitle] = createTitleUnits(
            {
                text: "Hello",
                subtitle: "World",
            },
            [
                INTERNAL_DEFAULT_CONFIG,
                {
                    title: {
                        subtitleFontSize: 15,
                    },
                },
            ]
        );

        expect(getTextMark(subtitle).size).toBe(15);
    });

    test("subtitle contributes to reserved title overhang", () => {
        const overhang = getTitleOverhang(
            {
                text: "Title",
                subtitle: "Subtitle",
                orient: "top",
                offset: 10,
                fontSize: 12,
                subtitleFontSize: 8,
                subtitlePadding: 3,
                angle: 0,
            },
            createFontContext()
        );

        expect(overhang).toEqual(new Padding(31, 0, 0, 0));
    });

    test("subtitle offset uses measured title extent", () => {
        const [, subtitle] = createTitleUnits(
            {
                text: "Title",
                subtitle: "Subtitle",
                orient: "top",
                offset: 10,
                fontSize: 12,
                subtitlePadding: 3,
                angle: 0,
            },
            [INTERNAL_DEFAULT_CONFIG],
            createFontContext()
        );

        expect(getTextMark(subtitle).yOffset).toBeCloseTo(3.8);
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

    test("built-in overlay-title style renders without reserving space", () => {
        const spec = createTitleView(
            {
                text: "Overlay",
                style: "overlay-title",
            },
            [INTERNAL_DEFAULT_CONFIG]
        ).titleSpec;

        expect(spec).toMatchObject({
            frame: "group",
            reserve: false,
        });
        expect(getTitleOverhang(spec, createFontContext())).toEqual(
            Padding.zero()
        );
    });
});
