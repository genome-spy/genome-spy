// @vitest-environment jsdom
import { expect, onTestFinished, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";
import { renderToLayout } from "../../view/testUtils.js";
import Rectangle from "../../view/layout/rectangle.js";

test("group rectangles reach explicit band endpoints on both axes", async () => {
    const { view } = await createHeadlessEngine({
        data: { lazy: { type: "scaleGroups", channels: ["x", "y"] } },
        mark: { type: "rect", fillOpacity: 0, stroke: "black" },
        encoding: {
            fill: { value: "black" },
            x: {
                field: "xStart",
                type: "nominal",
                axis: null,
                scale: {
                    type: "band",
                    domain: ["A", "B", "C"],
                    gapPositions: ["C"],
                    gapWidth: 10,
                },
            },
            x2: { field: "xEnd", band: 1 },
            y: {
                field: "yStart",
                type: "nominal",
                axis: null,
                scale: {
                    type: "band",
                    domain: ["R1", "R2", "R3"],
                    gapPositions: ["R3"],
                    gapWidth: 10,
                    reverse: true,
                },
            },
            y2: { field: "yEnd", band: 1 },
        },
    });
    onTestFinished(() => view.disposeSubtree());

    const { svg } = createSvg({
        viewRoot: view,
        logicalWidth: 100,
        logicalHeight: 100,
    });
    const bounds = Array.from(
        svg.querySelectorAll('[data-mark-type="rect"] rect'),
        (rect) =>
            ["x", "y", "width", "height"].map((key) =>
                Number(rect.getAttribute(key))
            )
    );
    // Three 30 px bands and one 10 px gap per axis, including a one-band group.
    expect(bounds).toEqual([
        [0, 0, 60, 60],
        [0, 70, 60, 30],
        [70, 0, 30, 60],
        [70, 70, 30, 30],
    ]);
});

test("categorical heat-map cells and real axes retain independent gaps on resize and reversal", async () => {
    const columns = ["A", "B", "C", "D"];
    const rows = ["R1", "R2", "R3", "R4"];
    const { view } = await createHeadlessEngine(
        {
            name: "matrix",
            data: {
                values: rows.flatMap((row) =>
                    columns.map((column) => ({ row, column }))
                ),
            },
            mark: { type: "rect", minWidth: 0, minHeight: 0 },
            encoding: {
                x: {
                    field: "column",
                    type: "nominal",
                    scale: {
                        type: "band",
                        domain: columns,
                        gapPositions: ["C"],
                        gapWidth: 8,
                    },
                    axis: { title: null },
                },
                y: {
                    field: "row",
                    type: "nominal",
                    scale: {
                        type: "band",
                        domain: rows,
                        gapPositions: ["R3"],
                        gapWidth: 6,
                        reverse: true,
                    },
                    axis: { title: null },
                },
                color: { value: "steelblue" },
            },
        },
        { contextOptions: { viewFactoryOptions: { wrapRoot: true } } }
    );
    onTestFinished(() => view.disposeSubtree());
    for (const width of [150, 250]) {
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: width,
            logicalHeight: 150,
        });
        const rects = Array.from(
            svg.querySelectorAll(
                '[data-name="matrix"] [data-mark-type="rect"] rect'
            )
        );
        expect(rects).toHaveLength(16);
        // Rects extend by .1 px at each edge to avoid ordinary inter-cell seams.
        const xEnd =
            Number(rects[1].getAttribute("x")) +
            Number(rects[1].getAttribute("width"));
        expect(Number(rects[2].getAttribute("x")) - xEnd).toBeCloseTo(7.8, 1);
        const yEnd =
            Number(rects[4].getAttribute("y")) +
            Number(rects[4].getAttribute("height"));
        expect(Number(rects[8].getAttribute("y")) - yEnd).toBeCloseTo(5.8, 1);
        expect(svg.querySelectorAll('[data-name="domain"] line')).toHaveLength(
            4
        );
        expect(
            Array.from(svg.querySelectorAll("text"), (text) => text.textContent)
        ).toEqual(expect.arrayContaining(["A", "B", "C", "D", "R1", "R4"]));
        expect(warnings).toEqual([]);
    }
});

test("unequal shared-scale placements lay out axis labels against their own gaps and extents", async () => {
    const categories = ["AAAA", "BBBB", "CCCC", "DDDD"];
    const { view } = await createHeadlessEngine(
        {
            data: { values: categories.map((category) => ({ category })) },
            resolve: { scale: { x: "shared" }, axis: { x: "independent" } },
            scales: {
                x: {
                    type: "band",
                    domain: categories,
                    gapPositions: ["CCCC"],
                    gapWidth: 8,
                },
            },
            hconcat: [100, 200].map((width) => ({
                name: "plot" + width,
                width,
                height: 24,
                mark: { type: "rect", minWidth: 0 },
                encoding: {
                    x: {
                        field: "category",
                        type: "nominal",
                        axis: {
                            title: /** @type {null} */ (null),
                            labelAngle: 0,
                            labelFontSize: 14,
                            labelOverlap: "parity",
                        },
                    },
                    y: { value: 0 },
                    y2: { value: 1 },
                    color: { value: "steelblue" },
                },
            })),
        },
        { contextOptions: { viewFactoryOptions: { wrapRoot: true } } }
    );
    onTestFinished(() => view.disposeSubtree());
    renderToLayout(view, Rectangle.create(0, 0, 360, 100));
    view.visit((child) => child.handleBroadcast({ type: "layoutComputed" }));
    const { svg, warnings } = createSvg({
        viewRoot: view,
        logicalWidth: 360,
        logicalHeight: 100,
    });
    const cells = [100, 200].map((width) =>
        Array.from(
            svg.querySelectorAll(
                '[data-name="plot' + width + '"] [data-mark-type="rect"] rect'
            )
        )
    );
    for (const plotCells of cells) {
        const end =
            Number(plotCells[1].getAttribute("x")) +
            Number(plotCells[1].getAttribute("width"));
        // Rects expand by .1 px on each side to conceal ordinary cell seams.
        expect(Number(plotCells[2].getAttribute("x")) - end).toBeCloseTo(
            7.8,
            1
        );
    }
    const axes = Array.from(svg.querySelectorAll('[data-name="axis_bottom"]'));
    expect(axes).toHaveLength(2);
    const labels = axes.map((axis) =>
        Array.from(axis.querySelectorAll("text"))
    );
    // These labels collide at 100 px but fit at 200 px; scale-default geometry would
    // wrongly hide C in the wider plot even though its projection is correct.
    expect(labels[0].map((label) => label.textContent)).toEqual([
        "AAAA",
        "DDDD",
    ]);
    expect(labels[1].map((label) => label.textContent)).toEqual(categories);
    const labelX = Number(
        labels[1][2].getAttribute("transform").match(/^translate\(([-\d.]+)/)[1]
    );
    const cellCenter =
        Number(cells[1][2].getAttribute("x")) +
        Number(cells[1][2].getAttribute("width")) / 2;
    expect(labelX).toBeCloseTo(cellCenter, 1);
    expect(warnings).toEqual([]);
});
