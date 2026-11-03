// @vitest-environment jsdom
import { expect, onTestFinished, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import UnitView from "../../view/unitView.js";
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    resolveThemeSelection,
    DEFAULT_THEME_NAME,
} from "../../config/themes.js";
import { getTopLevelSpecView } from "../../view/viewFactory.js";
import { createSvg } from "./index.js";

const contextOptions = {
    viewFactoryOptions: { wrapRoot: true },
    baseConfig: resolveBaseConfig({
        defaultConfig: INTERNAL_DEFAULT_CONFIG,
        builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
    }),
};

/** @param {import("../../view/view.js").default} view */
function render(view) {
    return createSvg({ viewRoot: view, logicalWidth: 300, logicalHeight: 300 })
        .svg;
}

test.each(/** @type {const} */ (["x", "y"]))(
    "%s band axes squeeze rotated labels and retain full tick data while panning",
    async (channel) => {
        const categories = [
            "A very long label",
            "B very long label",
            "C very long label",
            "D very long label",
        ];
        const { view } = await createHeadlessEngine(
            {
                width: channel === "x" ? 180 : 70,
                height: channel === "y" ? 180 : 70,
                data: { values: categories.map((category) => ({ category })) },
                mark: "rect",
                encoding: {
                    [channel]: {
                        field: "category",
                        type: "nominal",
                        scale: {
                            type: "band",
                            domain: categories,
                            zoom: true,
                            padding: 0.1,
                            gapPositions: [categories[2]],
                            gapWidth: 6,
                        },
                        // A non-axis-aligned angle would reject overlap removal if it
                        // were not bypassed by labelSqueeze.
                        axis: {
                            labelSqueeze: true,
                            labelAngle: 30,
                            labelOverlap: "greedy",
                            labelFontSize: 16,
                            title: null,
                        },
                    },
                },
            },
            { contextOptions }
        );
        onTestFinished(() => view.disposeSubtree());
        const labels = /** @type {UnitView} */ (
            view
                .getDescendants()
                .find(
                    (child) =>
                        child instanceof UnitView &&
                        child.name === "labels_main"
                )
        );
        const collector = labels.getCollector();
        const revision = collector.dataRevision;
        const svg = render(view);
        const text = Array.from(
            svg.querySelectorAll('[data-name="labels_main"] text')
        );
        expect(text.map((element) => element.textContent)).toEqual(categories);
        for (const element of text) {
            expect(element.getAttribute("transform")).toMatch(
                /rotate\(30\) scale\(0\./
            );
        }
        const x = getTopLevelSpecView(view).getScaleResolution(channel);
        await x.zoomToViewport({ interval: [1, 3] });
        const zoomed = render(view);
        expect(
            Array.from(
                zoomed.querySelectorAll('[data-name="labels_main"] text'),
                (element) => element.textContent
            )
        ).toEqual(categories.slice(1, 3));
        expect(
            zoomed.querySelectorAll('[data-name="ticks"] line')
        ).toHaveLength(2);
        expect(collector.dataRevision).toBe(revision);
        expect(Array.from(collector.getData(), (datum) => datum.value)).toEqual(
            categories
        );
        expect(x.getDomain()).toEqual(categories);
    }
);

test("squeezed axis labels remain aligned with ticks near viewport edges", async () => {
    const { view } = await createHeadlessEngine(
        {
            width: 180,
            height: 70,
            data: { values: ["A", "B", "C"].map((category) => ({ category })) },
            mark: "rect",
            encoding: {
                x: {
                    field: "category",
                    type: "nominal",
                    scale: { type: "band", viewport: [0.49, 2.49] },
                    axis: { labelSqueeze: true, labelAngle: -90, title: null },
                },
            },
        },
        { contextOptions }
    );
    onTestFinished(() => view.disposeSubtree());
    const svg = render(view);
    const labels = Array.from(
        svg.querySelectorAll('[data-name="labels_main"] text')
    );
    const ticks = Array.from(svg.querySelectorAll('[data-name="ticks"] line'));
    expect(labels.map((label) => label.textContent)).toEqual(["A", "B"]);
    for (const [index, label] of labels.entries()) {
        // A partially visible band must not slide its label toward the viewport.
        const x = Number(
            label.getAttribute("transform").match(/translate\(([-\d.]+)/)[1]
        );
        expect(x).toBeCloseTo(Number(ticks[index].getAttribute("x1")), 4);
    }
});

test("point axes cull offscreen ticks while retaining zero bandwidth", async () => {
    const { view } = await createHeadlessEngine(
        {
            width: 180,
            height: 70,
            data: {
                values: ["A", "B", "C", "D"].map((category) => ({ category })),
            },
            mark: "point",
            encoding: {
                y: {
                    field: "category",
                    type: "nominal",
                    scale: { type: "point", padding: 0.5, viewport: [1, 3] },
                    axis: { title: null },
                },
            },
        },
        { contextOptions }
    );
    onTestFinished(() => view.disposeSubtree());
    const svg = render(view);
    expect(
        Array.from(
            svg.querySelectorAll('[data-name="labels_main"] text'),
            (element) => element.textContent
        )
    ).toEqual(["B", "C"]);
    expect(svg.querySelectorAll('[data-name="ticks"] line')).toHaveLength(2);
});
