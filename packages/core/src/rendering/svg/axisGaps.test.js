// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import AxisView, { orient2channel } from "../../view/axisView.js";
import { createSvg } from "./index.js";
import { createWebGpuMarkConfig } from "../webgpu/webGpuMarkAdapter.js";
import Rectangle from "../../view/layout/rectangle.js";

/**
 * @param {import("../../spec/axis.js").AxisOrient} orient
 * @param {import("../../spec/scale.js").Scale} [scale]
 * @param {import("../../spec/root.js").RootSpec["params"]} [params]
 * @param {import("../../spec/channel.js").Type} [type]
 */
async function createAxis(orient, scale = {}, params = [], type) {
    const channel = orient2channel(orient);
    const engine = await createHeadlessEngine(
        {
            name: "plot",
            width: 100,
            height: 100,
            params,
            data: { values: [{ value: 0 }, { value: 19 }] },
            mark: "point",
            encoding: {
                color: { value: "black" },
                [channel]: {
                    field: "value",
                    type: type ?? (scale.type === "locus" ? "locus" : "index"),
                    scale: {
                        domain: [0, 19],
                        gapPositions: [10],
                        gapWidth: 6,
                        ...scale,
                    },
                    axis: {
                        orient,
                        ticks: false,
                        labels: false,
                        title: null,
                        domainColor: "purple",
                        domainWidth: 2,
                        domainDash: [3, 2],
                        domainCap: "round",
                    },
                },
            },
        },
        { contextOptions: { viewFactoryOptions: { wrapRoot: true } } }
    );
    const axis = /** @type {AxisView} */ (
        engine.view.getDescendants().find((view) => view instanceof AxisView)
    );
    const source =
        /** @type {import("../../data/sources/lazy/scaleGroupsSource.js").default | undefined} */ (
            axis.getDescendants().find((view) => view.name === "groups")
                ?.flowHandle.dataSource
        );
    const plot = engine.view
        .getDescendants()
        .find((view) => view.name === "plot");
    return {
        ...engine,
        axis,
        source,
        plot,
        draw: (size = 100) =>
            createSvg({
                viewRoot: engine.view,
                logicalWidth: size,
                logicalHeight: size,
                background: null,
            }).svg,
    };
}

/** @param {SVGSVGElement} svg */
function domainLines(svg) {
    return Array.from(svg.querySelectorAll('[data-name="domain"] line'));
}

/** @param {SVGSVGElement} svg
 * @param {"x" | "y"} channel
 */
function intervals(svg, channel) {
    return domainLines(svg)
        .map((line) =>
            [
                +line.getAttribute(channel + "1"),
                +line.getAttribute(channel + "2"),
            ].sort((a, b) => a - b)
        )
        .sort((a, b) => a[0] - b[0]);
}

test.each(["top", "bottom", "left", "right"])(
    "%s domain has styled pieces separated by the scale's gap",
    async (orient) => {
        const { view, draw } = await createAxis(
            /** @type {import("../../spec/axis.js").AxisOrient} */ (orient)
        );
        try {
            const svg = draw();
            expect(
                intervals(
                    svg,
                    orient2channel(
                        /** @type {import("../../spec/axis.js").AxisOrient} */ (
                            orient
                        )
                    )
                )
            ).toEqual([
                [0, 47],
                [53, 100],
            ]);
            const group = domainLines(svg)[0].parentElement;
            expect(group.getAttribute("stroke")).toBe("purple");
            expect(group.getAttribute("stroke-width")).toBe("2");
            expect(group.getAttribute("stroke-dasharray")).toBe("3 2");
            expect(group.getAttribute("stroke-linecap")).toBe("round");
        } finally {
            view.disposeSubtree();
        }
    }
);

test("navigation clamps partial groups, drops offscreen groups, and preserves partial gaps", async () => {
    const { view, axis, draw, source } = await createAxis("bottom", {
        zoom: true,
    });
    try {
        const complete = vi.spyOn(source, "complete");
        await axis.getScaleResolution("x").zoomTo([5, 14]);
        expect(intervals(draw(), "x")).toEqual([
            [0, 47],
            [53, 100],
        ]);
        await axis.getScaleResolution("x").zoomTo([11, 14]);
        expect(intervals(draw(), "x")).toEqual([[0, 100]]);
        // Pan the viewport edge into the gap's fractional insertion rank.
        const resolution = axis.getScaleResolution("x");
        await resolution.zoomTo([9, 16]);
        resolution.zoom(1, 50, -0.12, 100);
        view.paramRuntime.flushNow();
        const pieces = intervals(draw(200), "x");
        expect(pieces).toHaveLength(1);
        expect(pieces[0][0]).toBeGreaterThan(0);
        expect(pieces[0][0]).toBeLessThan(6);
        expect(complete).not.toHaveBeenCalled();
    } finally {
        view.disposeSubtree();
    }
});

test("reactive zero/null widths and empty/null cuts restore the independent continuous fallback", async () => {
    const { view, plot, draw } = await createAxis(
        "bottom",
        {
            gapPositions: { expr: "cuts" },
            gapWidth: { expr: "width" },
        },
        [
            { name: "cuts", value: [10] },
            { name: "width", value: 6 },
        ]
    );
    try {
        expect(domainLines(draw())).toHaveLength(2);
        for (const [name, value] of [
            ["width", 0],
            ["width", null],
            ["width", 6],
            ["cuts", []],
            ["cuts", null],
            ["cuts", [10]],
        ]) {
            plot.paramRuntime.setValue(/** @type {string} */ (name), value);
            plot.paramRuntime.flushNow();
            expect(domainLines(draw())).toHaveLength(
                value === 6 || (Array.isArray(value) && value.length) ? 2 : 1
            );
        }
    } finally {
        view.disposeSubtree();
    }
});

test.each([
    { gapWidth: 0 },
    { gapWidth: null },
    { gapPositions: [] },
    { gapPositions: null },
])(
    "constant-disabled gaps keep the original domain rule without a group source: %j",
    async (scale) => {
        const { view, axis, source, draw } = await createAxis("bottom", scale);
        try {
            expect(source).toBeUndefined();
            expect(
                axis.getDescendants().some((view) => view.name === "groups")
            ).toBe(false);
            expect(intervals(draw(), "x")).toEqual([[0, 100]]);
        } finally {
            view.disposeSubtree();
        }
    }
);

test("reversed output, outer padding, and exterior/boundary cuts retain finite nonempty pieces", async () => {
    const { view, draw } = await createAxis("bottom", {
        reverse: true,
        paddingOuter: 1,
        gapPositions: [0, 5, 20, 30],
    });
    try {
        const pieces = intervals(draw(), "x");
        expect(pieces).toHaveLength(2);
        expect(pieces[0][0]).toBeGreaterThan(0);
        expect(pieces[1][1]).toBeLessThan(100);
        expect(pieces[1][0] - pieces[0][1]).toBeCloseTo(6);
    } finally {
        view.disposeSubtree();
    }
});

test("locus axes reuse assembly-wide groups for chromosome gaps", async () => {
    const { view, draw, source } = await createAxis("bottom", {
        type: "locus",
        assembly: {
            contigs: [
                { name: "chrA", size: 10 },
                { name: "chrB", size: 20 },
            ],
        },
        gapPositions: "chromosomes",
    });
    try {
        const pieces = intervals(draw(), "x");
        expect(pieces).toHaveLength(2);
        expect(pieces[1][0] - pieces[0][1]).toBeCloseTo(6);
        expect(
            Array.from(
                /** @type {import("../../view/unitView.js").default} */ (
                    source.view
                )
                    .getCollector()
                    .getData()
            ).at(-1).xEnd
        ).toBe(30);
    } finally {
        view.disposeSubtree();
    }
});

test("shared scales project each domain occurrence at its own width without regenerating rows", async () => {
    const { view } = await createHeadlessEngine(
        {
            scales: {
                x: {
                    type: "index",
                    domain: [0, 19],
                    gapPositions: [10],
                    gapWidth: 6,
                },
            },
            data: { values: [{ value: 0 }, { value: 19 }] },
            encoding: {
                x: {
                    field: "value",
                    type: "index",
                    axis: { ticks: false, labels: false, title: null },
                },
                color: { value: "black" },
            },
            resolve: { scale: { x: "shared" }, axis: { x: "shared" } },
            hconcat: [
                { width: 100, height: 30, mark: "point" },
                { width: 200, height: 30, mark: "point" },
            ],
        },
        { contextOptions: { viewFactoryOptions: { wrapRoot: true } } }
    );
    try {
        expect(
            view.getDescendants().filter((v) => v instanceof AxisView)
        ).toHaveLength(1);
        const sources = view
            .getDescendants()
            .filter((v) => v.name === "groups")
            .map((v) => vi.spyOn(v.flowHandle.dataSource, "complete"));
        for (const size of [250, 400]) {
            const { svg } = createSvg({
                viewRoot: view,
                logicalWidth: size,
                logicalHeight: 160,
            });
            const domains = Array.from(
                svg.querySelectorAll('[data-name="domain"]')
            );
            expect(domains).toHaveLength(2);
            expect(
                domains.map((domain) => {
                    const [first, second] = Array.from(
                        domain.querySelectorAll("line")
                    );
                    const start = +first.getAttribute("x1");
                    return [
                        +first.getAttribute("x2") - start,
                        +second.getAttribute("x2") - start,
                        +second.getAttribute("x1") - +first.getAttribute("x2"),
                    ];
                })
            ).toEqual([
                [47, 100, 6],
                [97, 200, 6],
            ]);
        }
        for (const complete of sources) expect(complete).not.toHaveBeenCalled();
    } finally {
        view.disposeSubtree();
    }
});

test("quantitative encodings with an explicit index scale keep half-open axis endpoints", async () => {
    const { view, draw } = await createAxis(
        "bottom",
        { type: "index" },
        [],
        "quantitative"
    );
    try {
        const pieces = intervals(draw(), "x");
        expect(pieces).toHaveLength(2);
        expect(pieces[1][0] - pieces[0][1]).toBeCloseTo(6);
    } finally {
        view.disposeSubtree();
    }
});

test("reversed inclusive domains produce GPU-encodable guide endpoints", async () => {
    const { view, axis, draw } = await createAxis("bottom", {
        domain: [19, 0],
        reverse: true,
    });
    try {
        const groups = /** @type {import("../../view/unitView.js").default} */ (
            axis.getDescendants().find((v) => v.name === "groups")
        );
        expect(() =>
            createWebGpuMarkConfig(
                groups.mark,
                {},
                Rectangle.create(0, 0, 100, 100)
            )
        ).not.toThrow();
        const pieces = intervals(draw(), "x");
        expect(pieces).toHaveLength(2);
        expect(pieces[1][0] - pieces[0][1]).toBeCloseTo(6);
    } finally {
        view.disposeSubtree();
    }
});
