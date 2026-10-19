// @vitest-environment jsdom

import { expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createEmbedParamNamespace } from "../paramRuntime/embedParamApi.js";
import { createSvg } from "../rendering/svg/index.js";
import UnitView from "../view/unitView.js";
import { getTopLevelSpecView } from "../view/viewFactory.js";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import { resolveBaseConfig } from "./resolveConfig.js";
import { DEFAULT_THEME_COLORS } from "./themeColors.js";
import { DEFAULT_THEME_NAME, resolveThemeSelection } from "./themes.js";

/** @type {import("../spec/config.js").ThemeColors} */
const darkColors = {
    foreground: "#eeeeee",
    stroke: "#aaaaaa",
    grid: "#444444",
    chromosomeTick: "#999999",
    symbolStroke: "#bbbbbb",
    background: "#181818",
};

/** @param {import("../spec/root.js").RootSpec} spec */
async function create(spec) {
    /** @type {(() => void)[]} */
    const layoutListeners = [];
    const { view } = await createHeadlessEngine(spec, {
        contextOptions: {
            viewFactoryOptions: { wrapRoot: true },
            baseConfig: resolveBaseConfig({
                defaultConfig: INTERNAL_DEFAULT_CONFIG,
                builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
                theme: resolveThemeSelection(spec.theme),
            }),
            addBroadcastListener: (type, listener) => {
                if (type === "layoutComputed") {
                    layoutListeners.push(() => listener({ type }));
                }
            },
        },
    });
    const authored = getTopLevelSpecView(view);
    const params = createEmbedParamNamespace(authored);
    /** @type {import("../types/embedApi.js").ParamApi<import("../spec/config.js").ThemeColors>} */
    const palette = params.get("themeColors");
    const draw = () =>
        createSvg({
            viewRoot: view,
            logicalWidth: 640,
            logicalHeight: 620,
            background: null,
        }).svg;
    return {
        view,
        authored,
        params,
        palette,
        render: async () => {
            // Guide sources consume the browser's completed-layout publication.
            draw();
            view.visit((child) =>
                child.handleBroadcast({ type: "layoutComputed" })
            );
            for (const listener of layoutListeners) listener();
            await view.paramRuntime.whenPropagated();
            return draw();
        },
    };
}

/**
 * @param {import("../view/view.js").default} view
 * @param {string} name
 */
function unit(view, name) {
    const child = view.getDescendants().find((child) => child.name === name);
    if (!(child instanceof UnitView))
        throw new Error("Unit view not found: " + name);
    return child;
}

/**
 * @param {SVGSVGElement} svg
 * @param {string} selector
 * @param {string} attribute
 * @param {string} color
 */
function expectColor(svg, selector, attribute, color) {
    const marks = Array.from(svg.querySelectorAll(selector));
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.map((mark) => mark.getAttribute(attribute))).toEqual(
        marks.map(() => color)
    );
}

test.each(["unit", "layer", "concat"])(
    "the default palette is public on an authored %s root",
    async (shape) => {
        /** @type {import("../spec/view.js").UnitSpec} */
        const text = {
            name: "text",
            data: { values: [{}] },
            mark: { type: "text", text: "Hello" },
        };
        const spec =
            shape === "unit"
                ? text
                : shape === "layer"
                  ? { layer: [text] }
                  : { vconcat: [text] };
        const { view, authored, palette, render } = await create(spec);
        try {
            expect(palette.getValue()).toEqual(DEFAULT_THEME_COLORS);
            expect(
                view
                    .getDescendants()
                    .filter((child) =>
                        child.paramRuntime.paramConfigs.has("themeColors")
                    )
            ).toEqual([authored]);
            expectColor(
                await render(),
                '[data-name="text"] [data-mark-type="text"]',
                "fill",
                "black"
            );
            palette.setValue({ ...darkColors });
            await view.paramRuntime.whenPropagated();
            expectColor(
                await render(),
                '[data-name="text"] [data-mark-type="text"]',
                "fill",
                darkColors.foreground
            );
            expect(
                (await render()).querySelector('[data-name="background"]')
            ).toBeNull();
        } finally {
            view.disposeSubtree();
        }
    }
);

test("one palette update recolors generated guides and neutral marks while preserving data and interaction state", async () => {
    const { view, palette, render } = await create({
        title: { text: "Neutral title", subtitle: "Neutral subtitle" },
        config: { legend: { disable: false } },
        resolve: { scale: { x: "independent", size: "independent" } },
        vconcat: [
            {
                title: "Rules and data colors",
                data: {
                    values: [
                        { x: 1, x2: 3, y: 1, width: 1, group: "a" },
                        { x: 6, x2: 8, y: 2, width: 4, group: "b" },
                    ],
                },
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 10], zoom: true },
                        axis: { grid: true },
                    },
                    y: { field: "y", type: "quantitative" },
                },
                layer: [
                    {
                        name: "rules",
                        params: [{ name: "selected", select: "point" }],
                        mark: "rule",
                        encoding: {
                            x2: { field: "x2", type: "quantitative" },
                            size: {
                                field: "width",
                                type: "quantitative",
                                legend: { title: "Rule width" },
                            },
                            key: { field: "x" },
                        },
                    },
                    {
                        name: "dataColors",
                        mark: "point",
                        encoding: {
                            color: { field: "group", type: "nominal" },
                        },
                    },
                    {
                        name: "annotation",
                        mark: {
                            type: "text",
                            text: "Explicit annotation",
                            color: "red",
                        },
                    },
                ],
            },
            {
                data: {
                    values: [
                        { x: 1, x2: 3, y: 1, y2: 2, width: 1 },
                        { x: 6, x2: 8, y: 2, y2: 1, width: 4 },
                    ],
                },
                name: "links",
                mark: "link",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    x2: { field: "x2", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                    y2: { field: "y2", type: "quantitative" },
                    size: {
                        field: "width",
                        type: "quantitative",
                        legend: { title: "Link width" },
                    },
                },
            },
            {
                name: "neutralSizes",
                data: {
                    values: [
                        { width: 1, group: "a" },
                        { width: 4, group: "b" },
                    ],
                },
                mark: "point",
                encoding: {
                    size: {
                        field: "width",
                        type: "quantitative",
                        legend: { title: "Neutral size" },
                    },
                    color: { field: "group", type: "nominal", legend: null },
                },
            },
            {
                data: { values: [{}] },
                name: "genome",
                mark: { type: "text", text: "Genome" },
                scales: {
                    x: {
                        type: "locus",
                        domain: [
                            { chrom: "chr1", pos: 0 },
                            { chrom: "chr3", pos: 0 },
                        ],
                    },
                },
                axes: { x: { chromGrid: true } },
            },
        ],
    });
    try {
        const rules = unit(view, "rules");
        const selection =
            createEmbedParamNamespace(rules).getSelection("selected");
        if (selection.type !== "point")
            throw new Error("Expected a point selection.");
        selection.setValue([[1]]);
        const scale = rules.getScaleResolution("x");
        await scale.zoomTo([0, 5]);
        const initial = await render();
        const initialData = Array.from(rules.getCollector().getData());
        const selectionState = selection.getValue();
        const domain = scale.getDomain();
        const complete = vi.spyOn(rules.getCollector(), "complete");
        const dataColors = (/** @type {SVGSVGElement} */ svg) =>
            Array.from(
                svg.querySelectorAll(
                    '[data-name="dataColors"] [stroke], [data-name="dataColors"] [fill]'
                ),
                (element) => [
                    element.getAttribute("fill"),
                    element.getAttribute("stroke"),
                ]
            );
        const originalColors = dataColors(initial);
        expect(originalColors.length).toBeGreaterThan(0);

        palette.setValue({ ...darkColors });
        await view.paramRuntime.whenPropagated();
        const changed = await render();
        for (const name of ["rules", "links"]) {
            expectColor(
                changed,
                `[data-name="${name}"] [data-mark-type]`,
                "stroke",
                darkColors.foreground
            );
        }
        expectColor(
            changed,
            '[data-name="symbols"] [data-mark-type="rule"]',
            "stroke",
            darkColors.foreground
        );
        expectColor(
            changed,
            '[data-name="domain"] [data-mark-type="rule"]',
            "stroke",
            darkColors.stroke
        );
        expectColor(
            changed,
            '[data-name="grid_lines"] [data-mark-type="rule"]',
            "stroke",
            darkColors.grid
        );
        expectColor(
            changed,
            '[data-name="chromosome_ticks"] [data-mark-type="rule"]',
            "stroke",
            darkColors.chromosomeTick
        );
        expectColor(
            changed,
            '[data-name="chromosome_labels"] [data-mark-type="text"]',
            "fill",
            darkColors.foreground
        );
        const neutralLegend = Array.from(
            changed.querySelectorAll('[data-name="title"] text')
        )
            .find((text) => text.textContent === "Neutral size")
            .closest('[data-name="legend_right"]');
        expect(
            neutralLegend
                .querySelector('[data-name="symbols"] [data-mark-type="point"]')
                .getAttribute("fill")
        ).toBe(darkColors.foreground);
        for (const label of [
            "Neutral title",
            "Neutral subtitle",
            "Rule width",
            "Link width",
        ]) {
            const text = Array.from(changed.querySelectorAll("text")).find(
                (text) => text.textContent === label
            );
            expect(
                text.closest('[data-mark-type="text"]').getAttribute("fill")
            ).toBe(darkColors.foreground);
        }
        expectColor(
            changed,
            '[data-name="annotation"] [data-mark-type="text"]',
            "fill",
            "red"
        );
        expect(dataColors(changed)).toEqual(originalColors);
        expect(Array.from(rules.getCollector().getData())).toEqual(initialData);
        expect(
            Array.from(rules.getCollector().getData()).every(
                (datum, index) => datum === initialData[index]
            )
        ).toBe(true);
        expect(complete).not.toHaveBeenCalled();
        expect(scale.getDomain()).toEqual(domain);
        expect(selection.getValue()).toEqual(selectionState);
    } finally {
        view.disposeSubtree();
    }
});

test("authored palettes replace the root declaration, shadow lexically, and remain independent between embeds", async () => {
    const authoredPalette = { ...darkColors, foreground: "purple" };
    const first = await create({
        params: [{ name: "themeColors", value: authoredPalette }],
        vconcat: [
            {
                name: "inherited",
                data: { values: [{}] },
                mark: { type: "text", text: "Inherited" },
            },
            {
                name: "shadowed",
                params: [
                    {
                        name: "themeColors",
                        value: { ...darkColors, foreground: "orange" },
                    },
                ],
                data: { values: [{}] },
                mark: { type: "text", text: "Shadowed" },
            },
        ],
    });
    const second = await create({
        name: "other",
        config: { text: { color: "red" } },
        data: { values: [{}] },
        mark: { type: "text", text: "Independent" },
    });
    try {
        expect(first.palette.getValue()).toBe(authoredPalette);
        expectColor(
            await first.render(),
            '[data-name="inherited"] [data-mark-type="text"]',
            "fill",
            "purple"
        );
        first.palette.setValue({ ...darkColors, foreground: "green" });
        await first.view.paramRuntime.whenPropagated();
        const changed = await first.render();
        expectColor(
            changed,
            '[data-name="inherited"] [data-mark-type="text"]',
            "fill",
            "green"
        );
        expectColor(
            changed,
            '[data-name="shadowed"] [data-mark-type="text"]',
            "fill",
            "orange"
        );
        expect(second.palette.getValue()).toEqual(DEFAULT_THEME_COLORS);
        second.palette.setValue({ ...darkColors });
        await second.view.paramRuntime.whenPropagated();
        expectColor(
            await second.render(),
            '[data-name="other"] [data-mark-type="text"]',
            "fill",
            "red"
        );
    } finally {
        first.view.disposeSubtree();
        second.view.disposeSubtree();
    }
});

test("computed authored palettes use the normal read-only parameter API", async () => {
    const { view, params, palette, render } = await create({
        name: "text",
        params: [
            { name: "colors", value: { ...darkColors, foreground: "purple" } },
            { name: "themeColors", expr: "colors" },
        ],
        data: { values: [{}] },
        mark: { type: "text", text: "Computed palette" },
    });
    try {
        expectColor(
            await render(),
            '[data-name="text"] [data-mark-type="text"]',
            "fill",
            "purple"
        );
        expect(() => palette.setValue({ ...darkColors })).toThrow(
            /computed parameter/
        );
        /** @type {import("../types/embedApi.js").ParamApi<import("../spec/config.js").ThemeColors>} */
        const colors = params.get("colors");
        colors.setValue({ ...darkColors });
        await view.paramRuntime.whenPropagated();
        expectColor(
            await render(),
            '[data-name="text"] [data-mark-type="text"]',
            "fill",
            darkColors.foreground
        );
    } finally {
        view.disposeSubtree();
    }
});

test.each(
    /** @type {[import("../spec/config.js").BuiltInThemeName | undefined, string, string][]} */ ([
        [undefined, "black", darkColors.foreground],
        ["dark", "#fff", "#fff"],
        ["vegalite", "black", "black"],
    ])
)(
    "facet headers respect %s theme colors before and after palette updates",
    async (theme, initial, changed) => {
        const { view, palette, render } = await create({
            theme,
            data: {
                values: [
                    { row: "A", column: "C" },
                    { row: "B", column: "D" },
                ],
            },
            facet: { row: { field: "row" }, column: { field: "column" } },
            spec: { width: 100, height: 60, mark: "point" },
        });
        try {
            const selector =
                '[data-name^="facetHeader"] [data-mark-type="text"]';
            expectColor(await render(), selector, "fill", initial);
            palette.setValue({ ...darkColors });
            await view.paramRuntime.whenPropagated();
            expectColor(await render(), selector, "fill", changed);
        } finally {
            view.disposeSubtree();
        }
    }
);

test.each([{ background: "white" }, { theme: "dark" }])(
    "rejects an incomplete computed root palette with fixed appearance %j",
    async (fixedAppearance) => {
        await expect(
            create({
                .../** @type {import("../spec/root.js").RootConfig} */ (
                    fixedAppearance
                ),
                params: [
                    { name: "colors", value: { foreground: "white" } },
                    { name: "themeColors", expr: "colors" },
                ],
                data: { values: [{}] },
                mark: { type: "text", text: "Invalid palette" },
            })
        ).rejects.toThrow(/palette requires a color for "stroke"/);
    }
);

test("validates computed palette updates even with a fixed background", async () => {
    const { view, params } = await create({
        background: "white",
        params: [
            { name: "colors", value: { ...darkColors } },
            { name: "themeColors", expr: "colors" },
        ],
        data: { values: [{}] },
        mark: { type: "text", text: "Computed palette" },
    });
    try {
        /** @type {import("../types/embedApi.js").ParamApi<Partial<import("../spec/config.js").ThemeColors>>} */
        const colors = params.get("colors");
        view.paramRuntime.runInTransaction(() => {
            colors.setValue({ foreground: "white" });
        });
        const failed = expect(
            view.paramRuntime.whenPropagated()
        ).rejects.toThrow(/palette requires a color for "stroke"/);
        // Observe the synchronous failure so the scheduled flush cannot throw it
        // outside this test; propagation waiters still receive the same error.
        expect(() => view.paramRuntime.flushNow()).toThrow(
            /palette requires a color for "stroke"/
        );
        await failed;
    } finally {
        view.disposeSubtree();
    }
});
