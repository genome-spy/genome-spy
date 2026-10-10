// @vitest-environment jsdom

import { expect, test, vi } from "vitest";
import anscombeData from "../../../../../node_modules/vega-datasets/data/anscombe.json" with { type: "json" };
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import AxisView from "../../view/axisView.js";
import LegendView from "../../view/legendView.js";
import { createSvg } from "./index.js";
import { loadSharedExampleSpec } from "../../spec/exampleFiles.js";

const contextOptions = {
    baseConfig: resolveBaseConfig({
        defaultConfig: INTERNAL_DEFAULT_CONFIG,
        builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
    }),
    viewFactoryOptions: { wrapRoot: true },
};

test("documentation example renders the complete Anscombe quartet", async ({
    onTestFinished,
}) => {
    // Serve the installed dataset offline through the example's real URL source.
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(anscombeData)));
    onTestFinished(() => fetch.mockRestore());
    const { view } = await createHeadlessEngine(
        loadSharedExampleSpec(
            "examples/docs/grammar/facet/anscombe-wrapped.json"
        ),
        { contextOptions }
    );
    onTestFinished(() => view.disposeSubtree());

    const { svg, warnings } = createSvg({
        viewRoot: view,
        logicalWidth: 600,
        logicalHeight: 500,
    });
    expect(fetch).toHaveBeenCalledWith("vega-datasets/anscombe.json");
    expect(
        Array.from(
            svg.querySelectorAll('[data-mark-type="point"]'),
            (cell) => cell.querySelectorAll("circle").length
        )
    ).toEqual([11, 11, 11, 11]);
    expect(
        Array.from(
            svg.querySelectorAll('[data-name="facetHeaderColumn0"] text'),
            (text) => text.textContent
        )
    ).toEqual(["I", "II", "III", "IV"]);
    expect(warnings).toEqual([]);
});

test("hidden row headers preserve matrix columns and empty cells in SVG", async () => {
    const { view } = await createHeadlessEngine(
        {
            data: {
                values: [
                    { r: "A", c: 1 },
                    { r: "B", c: 2 },
                ],
            },
            facet: {
                row: { field: "r", header: null },
                column: { field: "c" },
            },
            spec: { name: "points", width: 100, height: 50, mark: "point" },
        },
        { contextOptions }
    );
    try {
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 200,
        });
        expect(svg.querySelector('[data-name="facetHeaderRow0"]')).toBeNull();
        expect(
            Array.from(
                svg.querySelectorAll('[data-name="facetHeaderColumn0"] text'),
                (text) => text.textContent
            )
        ).toEqual(["1", "2"]);
        expect(
            Array.from(
                svg.querySelectorAll('[data-name="points"]'),
                (cell) => cell.querySelectorAll("circle").length
            )
        ).toEqual([1, 0, 0, 1]);
        expect(warnings).toEqual([]);
    } finally {
        view.disposeSubtree();
    }
});

test("numeric header formatting preserves cell keys and nonnumeric labels", async () => {
    const { view } = await createHeadlessEngine(
        {
            data: {
                values: [
                    { r: 2000, c: "control" },
                    { r: 1000, c: true },
                ],
            },
            facet: {
                row: {
                    field: "r",
                    sort: "descending",
                    header: { format: ",.0f" },
                },
                column: {
                    field: "c",
                    sort: ["control", true],
                    header: { format: ".1f" },
                },
            },
            spec: { name: "points", width: 100, height: 50, mark: "point" },
        },
        { contextOptions }
    );
    try {
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 200,
        });
        expect(
            Array.from(
                svg.querySelectorAll('[data-name="facetHeaderRow0"] text'),
                (text) => text.textContent
            )
        ).toEqual(["2,000", "1,000"]);
        expect(
            Array.from(
                svg.querySelectorAll('[data-name="facetHeaderColumn0"] text'),
                (text) => text.textContent
            )
        ).toEqual(["control", "true"]);
        const points = view
            .getDescendants()
            .find((child) => child.name === "points");
        expect(Array.from(points.facetCoords.keys())).toEqual([
            [2000, "control"],
            [2000, true],
            [1000, "control"],
            [1000, true],
        ]);
        expect(warnings).toEqual([]);
    } finally {
        view.disposeSubtree();
    }
});

test("exports separate means after child aggregation drops the facet field", async () => {
    const { view } = await createHeadlessEngine(
        loadSharedExampleSpec("examples/docs/grammar/facet/means.json"),
        { contextOptions }
    );
    try {
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 200,
        });
        expect(
            Array.from(
                svg.querySelectorAll('[data-name="means"] text'),
                (text) => text.textContent
            )
        ).toEqual(["2", "15"]);
        expect(
            Array.from(
                svg.querySelectorAll('[data-name="facetHeaderColumn0"] text'),
                (text) => text.textContent
            )
        ).toEqual(["A", "B"]);
        expect(warnings).toEqual([]);
    } finally {
        view.disposeSubtree();
    }
});

test.each([false, true])(
    "exports one shared facet legend with reserved space (layered in concat: %s)",
    async (layered) => {
        /** @type {import("../../spec/view.js").UnitSpec} */
        const points = {
            name: "points",
            width: 100,
            height: 60,
            mark: "point",
            encoding: {
                color: { field: "category", type: "nominal" },
            },
        };
        /** @type {import("../../spec/view.js").FacetSpec} */
        const facet = {
            name: "facets",
            data: {
                values: [
                    { group: "A", category: "red" },
                    { group: "B", category: "blue" },
                    { group: "C", category: "red" },
                ],
            },
            facet: { field: "group" },
            columns: 2,
            spec: layered
                ? { layer: [points, { ...points, name: "second" }] }
                : points,
        };
        const { view } = await createHeadlessEngine(
            layered
                ? {
                      hconcat: [
                          facet,
                          {
                              name: "neighbor",
                              data: { values: [{}] },
                              width: 80,
                              height: 60,
                              mark: "point",
                          },
                      ],
                  }
                : facet,
            { contextOptions }
        );

        try {
            const legends = view
                .getDescendants()
                .filter((child) => child instanceof LegendView);
            expect(legends).toHaveLength(1);

            const { svg, warnings } = createSvg({
                viewRoot: view,
                logicalWidth: 800,
                logicalHeight: 400,
            });
            const legendGroups = svg.querySelectorAll(
                `[data-name="${legends[0].name}"]`
            );
            expect(legendGroups).toHaveLength(1);
            expect(
                Array.from(
                    legendGroups[0].querySelectorAll(
                        '[data-name="labels"] text'
                    ),
                    (label) => label.textContent
                )
            ).toEqual(["red", "blue"]);

            const facetCoords = view
                .getDescendants()
                .find((child) => child.name === "facets")
                .facetCoords.values()
                .next().value;
            const legendCoords = legends[0].facetCoords.values().next().value;
            expect(legendCoords.x).toBeGreaterThanOrEqual(facetCoords.x2);
            expect(legendCoords.width).toBeGreaterThan(0);
            if (layered) {
                // A neighboring plot must start after the shared legend reservation.
                const neighborCoords = view
                    .getDescendants()
                    .find((child) => child.name === "neighbor")
                    .facetCoords.values()
                    .next().value;
                expect(neighborCoords.x).toBeGreaterThanOrEqual(
                    legendCoords.x2
                );
            }
            expect(warnings).toEqual([]);
        } finally {
            view.disposeSubtree();
        }
    }
);

test("exports grouped points and distinct headers above each wrapped facet", async () => {
    const { view } = await createHeadlessEngine(
        {
            data: {
                values: [
                    { group: "A", x: 1 },
                    { group: "B", x: 2 },
                    { group: "B", x: 3 },
                    { group: "C", x: 4 },
                    { group: "D", x: 5 },
                ],
            },
            facet: { field: "group" },
            columns: 2,
            axes: { x: { orient: "top", title: null } },
            spec: {
                name: "points",
                width: 100,
                height: 50,
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                },
            },
        },
        { contextOptions }
    );

    try {
        const axes = view
            .getDescendants()
            .filter((child) => child instanceof AxisView);
        expect(axes.map((axis) => axis.axisProps.orient)).toEqual(["top"]);
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 300,
        });
        const cells = Array.from(svg.querySelectorAll('[data-name="points"]'));
        expect(
            cells.map((cell) => cell.querySelectorAll("circle").length)
        ).toEqual([1, 2, 1, 1]);

        const headers = Array.from(
            svg.querySelectorAll('[data-name="facetHeaderColumn0"] text')
        );
        expect(headers.map((header) => header.textContent)).toEqual([
            "A",
            "B",
            "C",
            "D",
        ]);

        // Later rows need their own header band, rather than overlapping labels.
        const positions = headers.map((header) =>
            header.getAttribute("transform")
        );
        expect(new Set(positions).size).toBe(4);
        expect(warnings).toEqual([]);
    } finally {
        view.disposeSubtree();
    }
});

test.each([0, 2])(
    "facet titles and chrome follow grid paint order with background zindex %s",
    async (zindex) => {
        const { view } = await createHeadlessEngine(
            {
                data: {
                    values: [
                        { group: "A", x: 0.25 },
                        { group: "B", x: 0.75 },
                    ],
                },
                facet: { field: "group" },
                spec: {
                    name: "points",
                    width: 100,
                    height: 60,
                    title: "Panel title",
                    view: {
                        fill: "#f0f4f8",
                        zindex,
                        stroke: "#abcdef",
                        strokeZindex: 10,
                    },
                    mark: { type: "point", clip: true },
                    encoding: {
                        fill: { value: "black" },
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                            axis: { title: null },
                        },
                    },
                },
            },
            { contextOptions }
        );

        try {
            const { svg, warnings } = createSvg({
                viewRoot: view,
                logicalWidth: 400,
                logicalHeight: 200,
            });
            const points = Array.from(
                svg.querySelectorAll('[data-name="points"]')
            );
            const backgrounds = Array.from(
                svg.querySelectorAll('[data-name="background0"]')
            );
            const strokes = Array.from(
                svg.querySelectorAll('[data-name="backgroundStroke0"]')
            );
            const titles = Array.from(
                svg.querySelectorAll('[data-name="title0"] text')
            );
            expect(points).toHaveLength(2);
            expect(backgrounds).toHaveLength(2);
            expect(strokes).toHaveLength(2);
            expect(titles.map((title) => title.textContent)).toEqual([
                "Panel title",
                "Panel title",
            ]);
            expect(
                new Set(titles.map((title) => title.getAttribute("transform")))
                    .size
            ).toBe(2);

            for (const [index, point] of points.entries()) {
                const background = backgrounds[index];
                const stroke = strokes[index];
                expect(
                    Boolean(
                        background.compareDocumentPosition(point) &
                        Node.DOCUMENT_POSITION_FOLLOWING
                    )
                ).toBe(zindex === 0);
                expect(
                    point.compareDocumentPosition(stroke) &
                        Node.DOCUMENT_POSITION_FOLLOWING
                ).toBeTruthy();
                // Background geometry follows the plot frame, excluding title and guide reservations.
                const clipUrl = point
                    .querySelector('[data-mark-type="point"]')
                    .getAttribute("clip-path");
                const clipRect = svg
                    .querySelector(clipUrl.slice(4, -1))
                    .querySelector("rect");
                const fillRect = background.querySelector("rect");
                // Rect marks add 0.1 px of seam padding around the plot frame.
                for (const attribute of ["x", "y", "width", "height"]) {
                    expect(
                        Number(fillRect.getAttribute(attribute))
                    ).toBeCloseTo(Number(clipRect.getAttribute(attribute)), 0);
                }
            }
            expect(warnings).toEqual([]);
        } finally {
            view.disposeSubtree();
        }
    }
);
