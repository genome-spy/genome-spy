// @vitest-environment jsdom

import { expect, onTestFinished, test, vi } from "vitest";
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
import UnitView from "../../view/unitView.js";
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

test.each(
    /** @type {const} */ ([
        ["facet", "bottom", "left"],
        ["facet", "top", "right"],
        ["concat", "bottom", "left"],
        ["concat", "top", "right"],
    ])
)(
    "%s shares %s/%s axes on incomplete wrapped rows",
    async (composition, xOrient, yOrient) => {
        const values = ["A", "B", "C", "D", "E"].map((g) => ({
            g,
            x: 0.5,
            y: 0.5,
        }));
        /** @type {import("../../spec/view.js").UnitSpec} */
        const points = {
            name: "points",
            width: 100,
            height: 60,
            title: composition === "facet" ? "Plot" : undefined,
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: { orient: xOrient, grid: true, title: null },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    axis: { orient: yOrient, grid: true, title: null },
                },
            },
        };
        const { view } = await createHeadlessEngine(
            {
                data: { values },
                resolve: {
                    scale: { x: "shared", y: "shared" },
                    axis: { x: "shared", y: "shared" },
                },
                columns: 3,
                ...(composition === "facet"
                    ? { facet: { field: "g", header: null }, spec: points }
                    : {
                          concat: values.map(({ g }) => ({
                              ...points,
                              name: "points" + g,
                              data: { values: [{ x: 0.5, y: 0.5 }] },
                          })),
                      }),
            },
            { contextOptions }
        );
        onTestFinished(() => view.disposeSubtree());
        const axes = view
            .getDescendants()
            .filter((child) => child instanceof AxisView);
        const render = () =>
            createSvg({
                viewRoot: view,
                logicalWidth: 600,
                logicalHeight: 400,
            });
        const { svg, warnings } = render();

        // The short final row still exposes one x axis per column and one y axis per row.
        expect(
            svg.querySelectorAll('[data-name="axis_' + xOrient + '"]')
        ).toHaveLength(3);
        expect(
            svg.querySelectorAll('[data-name="axis_' + yOrient + '"]')
        ).toHaveLength(2);
        expect(svg.querySelectorAll('[data-name="grid_lines"]')).toHaveLength(
            10
        );
        const plots = view
            .getDescendants()
            .filter(
                (child) =>
                    child instanceof UnitView && child.name.startsWith("points")
            );
        for (const plot of plots) {
            for (const coords of plot.facetCoords.values()) {
                expect([coords.width, coords.height]).toEqual([100, 60]);
            }
        }
        expect(warnings).toEqual([]);

        if (composition === "facet") {
            const xAxis = axes.find(
                (axis) => axis.axisProps.orient === xOrient
            );
            const yAxis = axes.find(
                (axis) => axis.axisProps.orient === yOrient
            );
            expect(Array.from(xAxis.facetCoords.keys())).toEqual(
                (xOrient === "top" ? ["A", "B", "C"] : ["C", "D", "E"]).map(
                    (g) => [g]
                )
            );
            expect(Array.from(yAxis.facetCoords.keys())).toEqual(
                (yOrient === "left" ? ["A", "D"] : ["C", "E"]).map((g) => [g])
            );
            const facet = view
                .getDescendants()
                .find((child) => "facet" in child.spec);
            const source =
                /** @type {import("../../data/sources/inlineSource.js").default} */ (
                    facet.flowHandle.dataSource
                );
            source.updateDynamicData(values.slice(0, 4));
            const updated = render();
            expect(
                updated.svg.querySelectorAll(
                    '[data-name="axis_' + xOrient + '"]'
                )
            ).toHaveLength(3);
            expect(Array.from(xAxis.facetCoords.keys())).toEqual(
                (xOrient === "top" ? ["A", "B", "C"] : ["B", "C", "D"]).map(
                    (g) => [g]
                )
            );
            expect(
                updated.svg.querySelectorAll('[data-name="title0"] text')
            ).toHaveLength(4);
        }
    }
);

test.each(
    /** @type {Array<["vertical" | "horizontal", "overlay-title" | undefined]>} */ ([
        ["vertical", undefined],
        ["horizontal", undefined],
        ["vertical", "overlay-title"],
        ["horizontal", "overlay-title"],
    ])
)(
    "outer facet axes and %s headers scroll with style %s",
    async (direction, style) => {
        const { view } = await createHeadlessEngine(
            {
                data: {
                    values: ["A", "B", "C", "D", "E"].map((g) => ({
                        g,
                        x: 0.5,
                        y: 0.5,
                    })),
                },
                facet: { field: "g", header: { style } },
                columns: 3,
                ...(direction === "vertical"
                    ? { viewportHeight: 90 }
                    : { viewportWidth: 160 }),
                spec: {
                    name: "points",
                    width: 100,
                    height: 60,
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                        y: { field: "y", type: "quantitative" },
                    },
                },
            },
            { contextOptions }
        );
        onTestFinished(() => view.disposeSubtree());
        const render = () =>
            createSvg({
                viewRoot: view,
                logicalWidth: 500,
                logicalHeight: 400,
            });
        const first = render();
        const axes = view
            .getDescendants()
            .filter((child) => child instanceof AxisView);
        const xAxis = axes.find((axis) => axis.axisProps.orient === "bottom");
        const yAxis = axes.find((axis) => axis.axisProps.orient === "left");
        expect(
            first.svg.querySelectorAll('[data-name="axis_bottom"]')
        ).toHaveLength(direction === "vertical" ? 1 : 2);
        expect(first.warnings).toEqual([]);

        const scrollbar =
            /** @type {import("../../view/gridView/scrollbar.js").default} */ (
                view
                    .getDescendants()
                    .find((child) => child.name === "scrollbar-" + direction)
            );
        scrollbar.setViewportOffset(Infinity);
        const last = render();
        const firstLabels = Array.from(
            first.svg.querySelectorAll('[data-name="facetHeaderColumn0"] text')
        );
        const lastLabels = Array.from(
            last.svg.querySelectorAll('[data-name="facetHeaderColumn0"] text')
        );
        if (style) {
            expect(firstLabels.map((label) => label.textContent)).toContain(
                "A"
            );
            // A partially visible cell can have its overlay anchor outside the viewport.
            expect(lastLabels.map((label) => label.textContent)).toContain(
                direction === "vertical" ? "E" : "C"
            );
            expect(lastLabels.map((label) => label.textContent)).not.toContain(
                "A"
            );
        }
        expect(last.warnings).toEqual([]);
        expect(Array.from(xAxis.facetCoords.keys())).toEqual(
            (direction === "vertical" ? ["D", "E"] : ["C", "E"]).map((g) => [g])
        );
        expect(Array.from(yAxis.facetCoords.keys())).toEqual(
            direction === "vertical" ? [["D"]] : []
        );
        // The final cell's plot and outer axis keep the same clipped horizontal span.
        const plot = view
            .getDescendants()
            .find((child) => child.name === "points");
        expect(xAxis.facetCoords.get(["E"]).x).toBe(
            plot.facetCoords.get(["E"]).x
        );
        expect(xAxis.facetCoords.get(["E"]).width).toBe(
            plot.facetCoords.get(["E"]).width
        );
    }
);

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

// Exercise category data, measured reservations, and emitted text together.
test.each(/** @type {const} */ (["left", "right", "top", "bottom"]))(
    "title-style row headers reserve space on the %s side of a matrix",
    async (orient) => {
        const { view } = await createHeadlessEngine(
            {
                data: {
                    values: [
                        { r: "A long category label", c: 1 },
                        { r: "B", c: 2 },
                    ],
                },
                facet: {
                    row: {
                        field: "r",
                        header: { style: "track-title", orient },
                    },
                    column: { field: "c", header: null },
                },
                spec: { name: "points", width: 100, height: 50, mark: "point" },
            },
            { contextOptions }
        );
        onTestFinished(() => view.disposeSubtree());
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 650,
            logicalHeight: 350,
        });
        const labels = Array.from(
            svg.querySelectorAll('[data-name="facetHeaderRow0"] text')
        );
        expect(labels.map((label) => label.textContent)).toEqual([
            "A long category label",
            "B",
        ]);
        const points = view
            .getDescendants()
            .find((child) => child.name === "points");
        const cells = Array.from(points.facetCoords.values());
        expect(cells).toHaveLength(4);
        for (const cell of cells) {
            expect([cell.width, cell.height]).toEqual([100, 50]);
        }
        labels.forEach((label, index) => {
            const [x, y] = getTextPosition(label);
            const first = cells[index * 2];
            const last = cells[index * 2 + 1];
            expect(label.getAttribute("transform")).not.toContain("rotate");
            expect(label.parentElement.getAttribute("text-anchor")).toBe("end");
            if (orient === "left") expect(x).toBeLessThan(first.x);
            else if (orient === "right") expect(x).toBeGreaterThan(last.x2);
            else if (orient === "top") expect(y).toBeLessThan(first.y);
            else expect(y).toBeGreaterThan(first.y2);
        });
        expect(warnings).toEqual([]);
    }
);

test.each([-1, 0, 1])(
    "overlay facet headers reclaim space and respect paint order %s",
    async (zindex) => {
        const { view } = await createHeadlessEngine(
            {
                data: { values: ["A", "B", "C"].map((g) => ({ g })) },
                facet: {
                    field: "g",
                    header: {
                        style: "overlay-title",
                        anchor: "end",
                        align: "right",
                        dx: -8,
                        offset: -6,
                        zindex,
                    },
                },
                columns: 2,
                spec: {
                    name: "points",
                    width: 100,
                    height: 50,
                    view: { fill: "white" },
                    mark: "point",
                },
            },
            { contextOptions }
        );
        onTestFinished(() => view.disposeSubtree());
        const facet = view
            .getDescendants()
            .find((child) => "facet" in child.spec);
        expect([facet.getSize().width.px, facet.getSize().height.px]).toEqual([
            210, 110,
        ]);
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 250,
        });
        const labels = Array.from(
            svg.querySelectorAll('[data-name="facetHeaderColumn0"] text')
        );
        const cells = Array.from(
            view
                .getDescendants()
                .find((child) => child.name === "points")
                .facetCoords.values()
        );
        expect(labels.map((label) => label.textContent)).toEqual([
            "A",
            "B",
            "C",
        ]);
        labels.forEach((label, i) => {
            const [x, y] = getTextPosition(label);
            expect(x).toBeCloseTo(cells[i].x2 - 8);
            expect(y).toBeCloseTo(cells[i].y + 6);
        });
        const background = svg.querySelector('[data-name="background0"]');
        expect(
            Boolean(
                background.compareDocumentPosition(labels[0]) &
                Node.DOCUMENT_POSITION_FOLLOWING
            )
        ).toBe(zindex >= 0);
        const point = svg.querySelector('[data-name="points"]');
        expect(
            Boolean(
                point.compareDocumentPosition(labels[0]) &
                Node.DOCUMENT_POSITION_FOLLOWING
            )
        ).toBe(zindex > 0);
        expect(warnings).toEqual([]);
    }
);

test("header config scopes, styles, and explicit properties follow title precedence", async () => {
    const { view } = await createHeadlessEngine(
        {
            config: {
                header: { color: "red", fontSize: 10, format: ",.0f" },
                headerRow: {
                    style: "row-label",
                    color: "green",
                    fontSize: 16,
                    format: ".1f",
                },
                headerColumn: { labels: false },
                style: { "row-label": { color: "blue", fontSize: 17 } },
            },
            data: { values: [{ r: 2000, c: "A" }] },
            facet: {
                row: { field: "r", header: { fontSize: 18 } },
                column: { field: "c" },
            },
            spec: { name: "points", width: 100, height: 50, mark: "point" },
        },
        { contextOptions }
    );
    onTestFinished(() => view.disposeSubtree());
    const { svg, warnings } = createSvg({
        viewRoot: view,
        logicalWidth: 400,
        logicalHeight: 250,
    });
    const label = svg.querySelector('[data-name="facetHeaderRow0"] text');
    expect(label.textContent).toBe("2000.0");
    expect(label.parentElement.getAttribute("font-size")).toBe("18");
    expect(label.parentElement.getAttribute("fill")).toBe("blue");
    expect(svg.querySelector('[data-name="facetHeaderColumn0"]')).toBeNull();
    expect(
        view.getDescendants().find((child) => child.name === "points").coords.y
    ).toBe(0);
    expect(warnings).toEqual([]);
});

/** @param {Element} text */
function getTextPosition(text) {
    // SVG text delta offsets are emitted as a second translation.
    return Array.from(
        text
            .getAttribute("transform")
            .matchAll(/translate\(([-.\d]+) ([-.\d]+)\)/g)
    ).reduce(
        ([x, y], match) => [x + Number(match[1]), y + Number(match[2])],
        [0, 0]
    );
}
