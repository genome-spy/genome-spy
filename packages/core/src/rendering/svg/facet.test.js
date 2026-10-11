// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from "vitest";
import anscombe from "../../../../../node_modules/vega-datasets/data/anscombe.json" with { type: "json" };
import cars from "../../../../../node_modules/vega-datasets/data/cars.json" with { type: "json" };
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";
import { loadSharedExampleSpec } from "../../spec/exampleFiles.js";
import AxisView from "../../view/axisView.js";
import LegendView from "../../view/legendView.js";
import Scrollbar from "../../view/gridView/scrollbar.js";

/** @type {import("../../spec/view.js").UnitSpec} */
const points = { name: "points", width: 100, height: 60, mark: "point" };
const values = ["A", "B", "C", "D", "E"].map((g) => ({ g, x: 0.5, y: 0.5 }));
const contextOptions = {
    baseConfig: resolveBaseConfig({
        defaultConfig: INTERNAL_DEFAULT_CONFIG,
        builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
    }),
    viewFactoryOptions: { wrapRoot: true },
};

/** @param {import("../../spec/root.js").RootSpec} spec */
async function initialize(spec) {
    const { view } = await createHeadlessEngine(spec, { contextOptions });
    onTestFinished(() => view.disposeSubtree());
    const render = () => {
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 1200,
            logicalHeight: 800,
        });
        expect(warnings).toEqual([]);
        return svg;
    };
    return { view, render };
}

/** @param {Element} svg @param {string} name @param {string} [suffix] */
const nodes = (svg, name, suffix = "") =>
    Array.from(svg.querySelectorAll(`[data-name="${name}"]${suffix}`));
/** @param {Element} svg @param {string} name */
const texts = (svg, name) =>
    nodes(svg, name, " text").map((t) => t.textContent);
/** @param {Element} text */
function position(text) {
    // The exporter emits text deltas as a second translation.
    return Array.from(
        text
            .getAttribute("transform")
            .matchAll(/translate\(([-.\d]+) ([-.\d]+)\)/g)
    ).reduce(([x, y], m) => [x + Number(m[1]), y + Number(m[2])], [0, 0]);
}
/** @param {import("../../view/view.js").default} view @param {string} name */
const find = (view, name) => view.getDescendants().find((v) => v.name === name);

// Real examples cover default wrapping, grouping, matrix cells, and automatic field titles.
test.each(
    /** @type {const} */ ([
        ["examples/docs/grammar/facet/anscombe-wrapped.json", anscombe],
        ["examples/core/facet/cars_matrix.json", cars],
    ])
)("renders example %s", async (path, data) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(data))
    );
    onTestFinished(() => {
        vi.restoreAllMocks();
    });
    const { view, render } = await initialize(loadSharedExampleSpec(path));
    const svg = render();
    if (data === anscombe) {
        expect(
            Array.from(
                svg.querySelectorAll('[data-mark-type="point"]'),
                (g) => g.querySelectorAll("circle").length
            )
        ).toEqual([11, 11, 11, 11]);
        expect(texts(svg, "facetHeaderColumn0")).toEqual([
            "I",
            "II",
            "III",
            "IV",
        ]);
    } else {
        expect(texts(svg, "facetTitleRow0")).toEqual(["Origin"]);
        expect(texts(svg, "facetTitleColumn0")).toEqual(["Cylinders"]);
        const row = nodes(svg, "facetTitleRow0", " text")[0];
        const column = nodes(svg, "facetTitleColumn0", " text")[0];
        expect(position(row)[0]).toBeLessThan(
            position(nodes(svg, "facetHeaderRow0", " text")[0])[0]
        );
        expect(position(column)[1]).toBeLessThan(
            position(nodes(svg, "facetHeaderColumn0", " text")[0])[1]
        );
        const plot = view.getDescendants().find((v) => {
            const x = v.spec.encoding?.x;
            return x && "field" in x && x.field === "Horsepower";
        });
        const cells = Array.from(plot.facetCoords.values());
        expect(cells).toHaveLength(15);
        expect(cells.every((c) => c.width === 150 && c.height === 150)).toBe(
            true
        );
        const bounds = cells.reduce((a, b) => a.union(b));
        expect(position(row)[1]).toBeCloseTo(bounds.y + bounds.height / 2);
        expect(position(column)[0]).toBeCloseTo(bounds.x + bounds.width / 2);
        expect(row.getAttribute("transform")).toContain("rotate(-90)");
    }
});

test.each(
    /** @type {const} */ ([
        ["facet", "bottom", "left"],
        ["facet", "top", "right"],
        ["concat", "bottom", "left"],
    ])
)(
    "%s shares outer %s/%s axes across incomplete rows and data updates",
    async (composition, xOrient, yOrient) => {
        /** @type {import("../../spec/view.js").UnitSpec} */
        const plot = {
            ...points,
            title: "Plot",
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
        const { view, render } = await initialize({
            data: { values },
            columns: 3,
            resolve: {
                scale: { x: "shared", y: "shared" },
                axis: { x: "shared", y: "shared" },
            },
            ...(composition === "facet"
                ? { facet: { field: "g", header: null }, spec: plot }
                : {
                      concat: values.map((d) => ({
                          ...plot,
                          name: "points" + d.g,
                          data: { values: [d] },
                      })),
                  }),
        });
        const svg = render();
        expect(nodes(svg, "axis_" + xOrient)).toHaveLength(3);
        expect(nodes(svg, "axis_" + yOrient)).toHaveLength(2);
        expect(nodes(svg, "grid_lines")).toHaveLength(10);
        if (composition === "facet") {
            const axis = view
                .getDescendants()
                .find(
                    (v) =>
                        v instanceof AxisView && v.axisProps.orient === xOrient
                );
            expect(Array.from(axis.facetCoords.keys())).toEqual(
                (xOrient === "top" ? ["A", "B", "C"] : ["C", "D", "E"]).map(
                    (g) => [g]
                )
            );
            const facet = view.getDescendants().find((v) => "facet" in v.spec);
            /** @type {import("../../data/sources/inlineSource.js").default} */ (
                facet.flowHandle.dataSource
            ).updateDynamicData(values.slice(0, 4));
            const updated = render();
            expect(nodes(updated, "axis_" + xOrient)).toHaveLength(3);
            expect(nodes(updated, "title0", " text")).toHaveLength(4);
            expect(Array.from(axis.facetCoords.keys())).toEqual(
                (xOrient === "top" ? ["A", "B", "C"] : ["B", "C", "D"]).map(
                    (g) => [g]
                )
            );
        }
    }
);

test.each(/** @type {const} */ (["vertical", "horizontal", "both"]))(
    "outer axes, overlay labels, and shared titles follow %s scrolling",
    async (direction) => {
        const { view, render } = await initialize({
            padding: 100,
            data: { values },
            facet: {
                field: "g",
                title: "Groups",
                header: { style: "overlay-title" },
            },
            columns: 3,
            ...(direction !== "horizontal" ? { viewportHeight: 90 } : {}),
            ...(direction !== "vertical" ? { viewportWidth: 160 } : {}),
            spec: {
                ...points,
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            },
        });
        const first = render();
        if (direction === "vertical")
            expect(texts(first, "facetTitleColumn0")).toEqual(["Groups"]);
        expect(texts(first, "facetHeaderColumn0")).toContain("A");
        for (const scrollbar of view
            .getDescendants()
            .filter((v) => v instanceof Scrollbar)) {
            scrollbar.setViewportOffset(Infinity);
        }
        const last = render();
        if (direction !== "both") {
            expect(texts(last, "facetHeaderColumn0")).toContain(
                direction === "vertical" ? "E" : "C"
            );
        }
        expect(texts(last, "facetHeaderColumn0")).not.toContain("A");
        if (direction === "vertical")
            expect(texts(last, "facetTitleColumn0")).toEqual([]);
        const axis = find(view, "axis_bottom");
        expect(
            nodes(last, "axis_bottom").filter((node) =>
                node.querySelector("[data-mark-type]")
            )
        ).toHaveLength(direction === "both" ? 1 : 2);
        const plot = find(view, "points").facetCoords.get(["E"]);
        expect(axis.facetCoords.get(["E"])).toMatchObject({
            x: plot.x,
            width: plot.width,
        });
    }
);

test("a layered facet reserves one legend before a neighboring plot", async () => {
    /** @type {import("../../spec/view.js").UnitSpec} */
    const colored = {
        ...points,
        encoding: { color: { field: "g", type: "nominal" } },
    };
    const { view, render } = await initialize({
        hconcat: [
            {
                name: "facets",
                data: { values: values.slice(0, 3) },
                facet: { field: "g" },
                columns: 2,
                spec: { layer: [colored, { ...colored, name: "second" }] },
            },
            { ...points, name: "neighbor", data: { values: [{}] } },
        ],
    });
    const svg = render();
    const legends = view
        .getDescendants()
        .filter((v) => v instanceof LegendView);
    expect(legends).toHaveLength(1);
    const [legend] = legends;
    expect(nodes(svg, legend.name)).toHaveLength(1);
    expect(texts(nodes(svg, legend.name)[0], "labels")).toEqual([
        "A",
        "B",
        "C",
    ]);
    const bounds = legend.facetCoords.values().next().value;
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.x).toBeGreaterThanOrEqual(
        find(view, "facets").facetCoords.values().next().value.x2
    );
    expect(find(view, "neighbor").coords.x).toBeGreaterThanOrEqual(bounds.x2);
});

test("hidden headers preserve empty matrix cells and directional spacing", async () => {
    const { view, render } = await initialize({
        data: {
            values: [
                { r: "A", c: 1 },
                { r: "B", c: 2 },
            ],
        },
        facet: { row: { field: "r", header: null }, column: { field: "c" } },
        spacing: { row: 3, column: 17 },
        spec: points,
    });
    const svg = render();
    expect(texts(svg, "facetHeaderRow0")).toEqual([]);
    expect(texts(svg, "facetHeaderColumn0")).toEqual(["1", "2"]);
    expect(
        nodes(svg, "points").map((g) => g.querySelectorAll("circle").length)
    ).toEqual([1, 0, 0, 1]);
    const cells = Array.from(find(view, "points").facetCoords.values());
    expect(cells[1].x - cells[0].x).toBe(117);
    expect(cells[2].y - cells[0].y).toBe(63);
    expect(cells.every((c) => c.width === 100 && c.height === 60)).toBe(true);
});

test("header scopes and styles precede explicit properties without changing numeric cell keys", async () => {
    const { view, render } = await initialize({
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
        spec: points,
    });
    const svg = render();
    const label = nodes(svg, "facetHeaderRow0", " text")[0];
    expect(label.textContent).toBe("2000.0");
    expect(label.parentElement.getAttribute("font-size")).toBe("18");
    expect(label.parentElement.getAttribute("fill")).toBe("blue");
    expect(texts(svg, "facetHeaderColumn0")).toEqual([]);
    expect(Array.from(find(view, "points").facetCoords.keys())).toEqual([
        [2000, "A"],
    ]);
});

test.each(/** @type {const} */ (["left", "right", "top", "bottom"]))(
    "track-style row headers reserve the %s side",
    async (orient) => {
        const { view, render } = await initialize({
            data: {
                values: [
                    { r: "A long category label", c: 1 },
                    { r: "B", c: 2 },
                ],
            },
            facet: {
                row: { field: "r", header: { style: "track-title", orient } },
                column: { field: "c", header: null },
            },
            spec: points,
        });
        const svg = render();
        const labels = nodes(svg, "facetHeaderRow0", " text");
        expect(labels.map((t) => t.textContent)).toEqual([
            "A long category label",
            "B",
        ]);
        const cells = Array.from(find(view, "points").facetCoords.values());
        labels.forEach((label, i) => {
            const [x, y] = position(label);
            expect(label.getAttribute("transform")).not.toContain("rotate");
            expect(label.parentElement.getAttribute("text-anchor")).toBe("end");
            const first = cells[i * 2],
                last = cells[i * 2 + 1];
            if (orient === "left") expect(x).toBeLessThan(first.x);
            else if (orient === "right") expect(x).toBeGreaterThan(last.x2);
            else if (orient === "top") expect(y).toBeLessThan(first.y);
            else expect(y).toBeGreaterThan(first.y2);
        });
    }
);

test.each([-1, 0, 1])(
    "overlay labels and plot chrome respect paint order %s",
    async (zindex) => {
        const { view, render } = await initialize({
            data: { values: values.slice(0, 3) },
            columns: 2,
            facet: {
                field: "g",
                title: null,
                header: {
                    style: "overlay-title",
                    anchor: "end",
                    align: "right",
                    dx: -8,
                    offset: -6,
                    zindex,
                },
            },
            spec: {
                ...points,
                title: "Panel",
                view: { fill: "white", stroke: "gray", strokeZindex: 10 },
                mark: { type: "point", clip: true },
            },
        });
        const svg = render();
        expect(texts(svg, "title0")).toEqual(["Panel", "Panel", "Panel"]);
        const labels = nodes(svg, "facetHeaderColumn0", " text");
        const cells = Array.from(find(view, "points").facetCoords.values());
        labels.forEach((label, i) => {
            const [x, y] = position(label);
            expect(x).toBeCloseTo(cells[i].x2 - 8);
            expect(y).toBeCloseTo(cells[i].y + 6);
        });
        const background = nodes(svg, "background0")[0];
        const plot = nodes(svg, "points")[0];
        expect(
            Boolean(
                background.compareDocumentPosition(labels[0]) &
                Node.DOCUMENT_POSITION_FOLLOWING
            )
        ).toBe(zindex >= 0);
        expect(
            Boolean(
                plot.compareDocumentPosition(labels[0]) &
                Node.DOCUMENT_POSITION_FOLLOWING
            )
        ).toBe(zindex > 0);
        expect(
            plot.compareDocumentPosition(nodes(svg, "backgroundStroke0")[0]) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        const clip = svg
            .querySelector(
                plot
                    .querySelector('[data-mark-type="point"]')
                    .getAttribute("clip-path")
                    .slice(4, -1)
            )
            .querySelector("rect");
        for (const attr of ["x", "y", "width", "height"])
            expect(
                Number(background.querySelector("rect").getAttribute(attr))
            ).toBeCloseTo(Number(clip.getAttribute(attr)), 0);
    }
);

test.each(
    /** @type {Array<{title: import("../../spec/channel.js").FacetFieldDef["title"], header: import("../../spec/channel.js").FacetFieldDef["header"], titles: string[], labels: string[]}>} */ ([
        { title: null, header: undefined, titles: [], labels: ["A"] },
        { title: undefined, header: null, titles: [], labels: [] },
        {
            title: undefined,
            header: { labels: false },
            titles: ["g"],
            labels: [],
        },
        {
            title: { text: "Groups", subtitle: "Categories", orient: "bottom" },
            header: undefined,
            titles: ["Groups", "Categories"],
            labels: ["A"],
        },
    ])
)(
    "field title and label visibility are independent: %j",
    async ({ title, header, titles, labels }) => {
        const { render } = await initialize({
            data: { values: [{ g: "A" }] },
            facet: { field: "g", title, header },
            spec: points,
        });
        const svg = render();
        expect(texts(svg, "facetTitleColumn0")).toEqual(titles);
        expect(texts(svg, "facetHeaderColumn0")).toEqual(labels);
    }
);
