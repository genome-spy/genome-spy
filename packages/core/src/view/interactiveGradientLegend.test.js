// @vitest-environment jsdom
import { expect, test } from "vitest";
import { createTestEmbed } from "./embedTestUtils.js";
import { renderToLayout } from "./testUtils.js";
import { intervalSelection } from "../selection/index.js";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";
import { DEFAULT_THEME_NAME, resolveThemeSelection } from "../config/themes.js";
const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});
import { createSvg } from "../rendering/svg/index.js";

/** @param {"linear"|"log"} [type]
 * @param {boolean} [vertical]
 * @returns {import("../spec/view.js").UnitSpec & import("../spec/root.js").RootConfig}
 */
function spec(type = "linear", vertical = false) {
    return {
        name: "cells",
        width: 300,
        height: 200,
        config: {
            legend: { disable: false, labelColor: "#333", titleColor: "#333" },
        },
        params: [
            {
                name: "scores",
                select: { type: "interval", encodings: ["color"] },
                bind: "legend",
            },
        ],
        data: {
            values: [
                { score: 1 },
                { score: 3 },
                { score: 10 },
                { score: 30 },
                { score: 100 },
                { score: 120 },
                { score: null },
                { score: NaN },
                { score: Infinity },
            ],
        },
        mark: "point",
        encoding: {
            x: { field: "score", type: "quantitative" },
            color: {
                field: "score",
                type: "quantitative",
                scale: { type, domain: [1, 100] },
                legend: {
                    orient: vertical ? "right" : "bottom",
                    direction: vertical ? "vertical" : "horizontal",
                    gradientLength: 160,
                },
            },
            opacity: { condition: { param: "scores", value: 1 }, value: 0.15 },
        },
    };
}

test.each([false, true])(
    "numeric range consumes raw inputs and preserves exported ramp/brush (vertical=%s)",
    async (vertical) => {
        const { root, views } = await createTestEmbed(
            spec("linear", vertical),
            {
                contextOptions: {
                    baseConfig,
                    viewFactoryOptions: { wrapRoot: true },
                },
            }
        );
        const params = views.get({ scope: [], view: "cells" }).params;
        params.get("scores").setValue(intervalSelection({ color: [3, 100] }));
        const cells = root.getDescendants().find((v) => v.name === "cells");
        const unit = /** @type {import("./unitView.js").default} */ (cells);
        const ramp = root
            .getDescendants()
            .find((view) => view.name === "gradientRamp");
        expect(ramp.getScaleResolution("color")).toBe(
            unit.getScaleResolution("color")
        );
        expect(
            Array.from(unit.getCollector().getData(), (row) =>
                unit.mark.encoders.fillOpacity(row)
            )
        ).toEqual([0.15, 1, 1, 1, 0.15, 0.15, 0.15, 0.15, 0.15]);
        params
            .get("scores")
            .setValue(intervalSelection({ color: [30, Infinity] }));
        expect(
            Array.from(unit.getCollector().getData(), (row) =>
                unit.mark.encoders.fillOpacity(row)
            )
        ).toEqual([0.15, 0.15, 0.15, 1, 1, 1, 0.15, 0.15, 0.15]);
        const svg = createSvg({
            viewRoot: root,
            logicalWidth: 600,
            logicalHeight: 400,
            background: null,
        }).svg;
        expect(
            svg.querySelectorAll('linearGradient[id^="legend-gradient-"]')
        ).toHaveLength(1);
        expect(
            svg.querySelector('[data-name="gradientBrush"] rect')
        ).not.toBeNull();
        expect(svg.textContent).toContain(">= 30");
    }
);

test("log ramp inversion, open upper edge, and zero width remain distinct from clear", async () => {
    const { root, views } = await createTestEmbed(spec("log"), {
        contextOptions: { baseConfig, viewFactoryOptions: { wrapRoot: true } },
    });
    renderToLayout(root);
    const params = views.get({ scope: [], view: "cells" }).params;
    const selected =
        /** @type {import("../types/embedApi.js").IntervalSelectionApi} */ (
            params.getSelection("scores")
        );
    const host = rampHost(root, "cells");
    await host.start(0.5);
    host.move(1);
    host.end();
    expect(selected.getValue().intervals.color).toEqual([
        expect.closeTo(10),
        Infinity,
    ]);
    selected.clear();
    await host.start(1);
    host.move(1);
    host.end();
    expect(selected.getValue().active).toBe(false);
    params.get("scores").setValue(intervalSelection({ color: [100, 100] }));
    expect(selected.getValue()).toMatchObject({
        active: true,
        intervals: { color: [100, 100] },
    });
    selected.clear();
    expect(selected.getValue().active).toBe(false);
});

test("numeric filters, consumer mapping, and sampling use the same range", async () => {
    const source = spec();
    source.params[0].push = "outer";
    const { root, views } = await createTestEmbed({
        params: [{ name: "scores" }],
        vconcat: [
            source,
            {
                name: "other",
                data: {
                    values: [
                        { metrics: { activation: 3 } },
                        { metrics: { activation: 100 } },
                        { metrics: { activation: 120 } },
                        { metrics: { activation: null } },
                        { metrics: { activation: Infinity } },
                    ],
                },
                transform: [
                    {
                        type: "filter",
                        param: "scores",
                        fields: { color: "metrics.activation" },
                    },
                ],
                mark: "point",
                encoding: {
                    fill: {
                        field: "metrics.activation",
                        type: "quantitative",
                        scale: { domain: [1, 120] },
                    },
                    opacity: {
                        condition: {
                            param: "scores",
                            project: { color: "fill" },
                            value: 1,
                        },
                        value: 0.1,
                    },
                },
            },
        ],
    });
    views
        .get({ scope: [], view: "cells" })
        .params.get("scores")
        .setValue(intervalSelection({ color: [3, 100] }));
    await root.paramRuntime.whenPropagated();
    const other = /** @type {import("./unitView.js").default} */ (
        root.getDescendants().find((v) => v.name === "other")
    );
    const rows = Array.from(other.getCollector().getData());
    expect(rows.map((row) => row.metrics.activation)).toEqual([3]);
    expect(other.mark.encoders.fillOpacity(rows[0])).toBe(1);
    expect(
        /** @type {import("../marks/point.js").default} */ (
            other.mark
        ).isPreservedBySelection(rows[0])
    ).toBe(false);
    views
        .get({ scope: [], view: "cells" })
        .params.get("scores")
        .setValue(intervalSelection({ color: [100, Infinity] }));
    await root.paramRuntime.whenPropagated();
    expect(
        Array.from(
            other.getCollector().getData(),
            (row) => row.metrics.activation
        )
    ).toEqual([100, 120]);
});

/** Real controller input with document-owned drags, independent of renderer picking.
 * @param {import("./view.js").default} root
 * @param {string} name
 */
function rampHost(root, name) {
    const unit = root.getDescendants().find((view) => view.name === name);
    const controller = /** @type {any} */ (
        unit.paramRuntime.getSelectionController("scores")
    );
    const legend = controller.host.view;
    const point = (/** @type {number} */ fraction, cross = 0) => {
        const coords = controller.host.getProjectionCoords("color");
        return controller.host.ramp.horizontal
            ? {
                  x: coords.x + coords.width * fraction,
                  y: coords.y + coords.height / 2 + cross,
              }
            : {
                  x: coords.x + coords.width / 2 + cross,
                  y: coords.y2 - coords.height * fraction,
              };
    };
    return {
        legend,
        async start(/** @type {number} */ fraction) {
            const p = point(fraction);
            const { default: Interaction } =
                await import("../utils/interaction.js");
            const { default: Point } = await import("./layout/point.js");
            legend.propagateInteraction(
                new Interaction(
                    new Point(p.x, p.y),
                    new MouseEvent("mousedown", {
                        button: 0,
                        clientX: p.x,
                        clientY: p.y,
                    })
                )
            );
        },
        move(/** @type {number} */ fraction, cross = 0) {
            const p = point(fraction, cross);
            document.dispatchEvent(
                new MouseEvent("mousemove", { clientX: p.x, clientY: p.y })
            );
        },
        end() {
            document.dispatchEvent(new MouseEvent("mouseup"));
        },
        async wheel(
            /** @type {number} */ fraction,
            /** @type {number} */ deltaY
        ) {
            const p = point(fraction);
            const { default: Interaction } =
                await import("../utils/interaction.js");
            const { default: Point } = await import("./layout/point.js");
            legend.propagateInteraction(
                new Interaction(
                    new Point(p.x, p.y),
                    new WheelEvent("wheel", {
                        clientX: p.x,
                        clientY: p.y,
                        deltaY,
                    })
                )
            );
        },
    };
}

test("unchanged log geometry does not open finite API bounds and invalid writes do not cancel a drag", async () => {
    const { root, views } = await createTestEmbed(spec("log"), {
        contextOptions: { baseConfig, viewFactoryOptions: { wrapRoot: true } },
    });
    renderToLayout(root);
    const params = views.get({ scope: [], view: "cells" }).params;
    const selection =
        /** @type {import("../types/embedApi.js").IntervalSelectionApi} */ (
            params.getSelection("scores")
        );
    const host = rampHost(root, "cells");
    params.get("scores").setValue(intervalSelection({ color: [3, 100] }));
    /** @type {import("../types/embedApi.js").SelectionSnapshot[]} */
    const commits = [];
    selection.subscribe((value) => commits.push(value), { delivery: "commit" });
    await host.start(0.75);
    host.move(0.75, 30);
    host.end();
    expect(selection.getValue().intervals.color).toEqual([3, 100]);
    expect(commits).toHaveLength(0);
    params.get("scores").setValue(intervalSelection({ color: [1, 100] }));
    commits.length = 0;
    await host.wheel(0.5, 120);
    expect(selection.getValue().intervals.color).toEqual([1, 100]);
    expect(commits).toHaveLength(0);

    selection.clear();
    commits.length = 0;
    await host.start(0.5);
    host.move(0.7);
    for (const bounds of [
        [3, null],
        [Infinity, Infinity],
        [3, "Infinity"],
        [3, -Infinity],
    ]) {
        expect(() =>
            params.get("scores").setValue(
                /** @type {any} */ ({
                    type: "interval",
                    intervals: { color: bounds },
                })
            )
        ).toThrow(/finite lower/);
    }
    host.move(1);
    host.end();
    expect(selection.getValue().intervals.color).toEqual([
        expect.closeTo(10),
        Infinity,
    ]);
    expect(commits).toHaveLength(1);
});

test("compatible outer hosts project independently, retain open bounds across domains, and commit once", async () => {
    const children = [1, 2].map((max, index) => {
        const child = /** @type {any} */ (spec("linear", !!index));
        child.name = index ? "large" : "small";
        child.params[0].push = "outer";
        child.params[0].select = {
            type: "interval",
            encodings: ["color"],
            mark: { fillOpacity: { expr: "localOpacity" } },
        };
        child.params.push({ name: "localOpacity", value: index ? 0.8 : 0.2 });
        child.encoding.color.scale.domain = [0, max];
        return child;
    });
    const { root, views } = await createTestEmbed(
        {
            params: [{ name: "scores" }],
            resolve: {
                scale: { color: "independent" },
                legend: { color: "independent" },
            },
            hconcat: children,
        },
        { contextOptions: { baseConfig } }
    );
    renderToLayout(root);
    const selection =
        /** @type {import("../types/embedApi.js").IntervalSelectionApi} */ (
            views
                .get({ scope: [], view: "small" })
                .params.getSelection("scores")
        );
    const small = rampHost(root, "small"),
        large = rampHost(root, "large");
    /** @type {import("../types/embedApi.js").SelectionSnapshot[]} */
    const commits = [];
    selection.subscribe((value) => commits.push(value), { delivery: "commit" });
    await small.start(0.3);
    small.move(1);
    expect(commits).toHaveLength(0);
    small.end();
    expect(selection.getValue().intervals.color).toEqual([
        expect.closeTo(0.3),
        Infinity,
    ]);
    expect(commits).toHaveLength(1);
    expect(large.legend.paramRuntime.getValue("legendBrush").end).toBe(1);
    for (const [host, opacity] of /** @type {const} */ ([
        [small, 0.2],
        [large, 0.8],
    ])) {
        const brush = host.legend
            .getDescendants()
            .find(
                (/** @type {import("./unitView.js").default} */ view) =>
                    view.name === "gradientBrush"
            );
        expect(
            brush.mark.encoders.fillOpacity(
                Array.from(brush.getCollector().getData())[0]
            )
        ).toBe(opacity);
    }
    await large.wheel(0.5, -120);
    const finite = selection.getValue().intervals.color;
    expect(finite[1]).toBeGreaterThan(1);
    expect(finite[1]).toBeLessThan(2);
    expect(small.legend.paramRuntime.getValue("legendBrush").end).toBe(1);
    await small.start(0.8);
    small.move(0.8, 30);
    small.end();
    expect(selection.getValue().intervals.color).toEqual(finite);

    await large.start(0.5);
    large.move(0.6);
    // A second explicit host takes over without completing the canceled gesture.
    const count = commits.length;
    await small.start(0.1);
    small.move(0.2);
    small.end();
    expect(commits).toHaveLength(count + 1);
});

test("reversed vertical maximum opens upward-independent numeric bounds and source mapping cancels stale input", async () => {
    const input = /** @type {any} */ (spec("log", true));
    input.params.push({ name: "limit", value: 100 });
    input.encoding.color.scale.domain = [1, { expr: "limit" }];
    input.encoding.color.scale.reverse = true;
    const { root, views } = await createTestEmbed(input, {
        contextOptions: { baseConfig, viewFactoryOptions: { wrapRoot: true } },
    });
    renderToLayout(root);
    const params = views.get({ scope: [], view: "cells" }).params;
    const selected =
        /** @type {import("../types/embedApi.js").IntervalSelectionApi} */ (
            params.getSelection("scores")
        );
    const host = rampHost(root, "cells");
    await host.start(0.5);
    host.move(0);
    host.end();
    expect(selected.getValue().intervals.color).toEqual([
        expect.closeTo(10),
        Infinity,
    ]);
    params.get("limit").setValue(30);
    await root.paramRuntime.whenPropagated();
    expect(selected.getValue().intervals.color).toEqual([
        expect.closeTo(10),
        Infinity,
    ]);
    expect(host.legend.paramRuntime.getValue("legendBrush").start).toBe(0);
    await host.start(0.2);
    host.move(0.3);
    const last = selected.getValue();
    params.get("limit").setValue(100);
    await root.paramRuntime.whenPropagated();
    host.move(0.9);
    host.end();
    expect(selected.getValue()).toEqual(last);
});

test("collected gradients reject conflicting interaction settings and noninvertible binding", async () => {
    const first = /** @type {any} */ (spec()),
        second = /** @type {any} */ (spec());
    first.name = "first";
    second.name = "second";
    first.params[0].push = second.params[0].push = "outer";
    second.params[0].select.zoom = false;
    await expect(
        createTestEmbed(
            {
                params: [{ name: "scores" }],
                resolve: {
                    scale: { color: "shared" },
                    legend: { color: "shared" },
                },
                hconcat: [first, second],
            },
            { contextOptions: { baseConfig } }
        )
    ).rejects.toThrow(/conflicting interaction settings/);
    const invalid = /** @type {any} */ (spec());
    invalid.encoding.color.scale.type = "quantize";
    await expect(createTestEmbed(invalid)).rejects.toThrow(
        /quantitative gradient/
    );
    invalid.encoding.color.scale.type = "linear";
    delete invalid.params[0].bind;
    await expect(createTestEmbed(invalid)).rejects.toThrow(
        /requires one legend-bound/
    );
});

test("shared quantitative color/secondary-position fields retain missing values in one GPU attribute", async () => {
    const input = /** @type {any} */ (spec());
    input.mark = "rect";
    input.data.values = input.data.values.map((/** @type {object} */ row) => ({
        ...row,
        start: 0,
    }));
    input.encoding.x = {
        field: "start",
        type: "quantitative",
        scale: { domain: [0, 120] },
    };
    input.encoding.x2 = { field: "score" };
    const { root } = await createTestEmbed(input, {
        contextOptions: { baseConfig, viewFactoryOptions: { wrapRoot: true } },
    });
    renderToLayout(root);
    const unit = /** @type {import("./unitView.js").default} */ (
        root.getDescendants().find((view) => view.name === "cells")
    );
    const rows = Array.from(unit.getCollector().getData());
    const { RectVertexBuilder } =
        await import("../rendering/webgl/gl/dataToVertices.js");
    const builder = new RectVertexBuilder({
        encoders: unit.mark.encoders,
        attributes: ["x", "x2", "fill"],
        numItems: rows.length,
    });
    builder.addBatch(null, rows);
    const arrays = builder.toArrays().arrays;
    expect(Object.keys(arrays).filter((key) => key.includes("fill"))).toEqual([
        "attr_fill_x2",
    ]);
    expect(
        Array.from(arrays.attr_fill_x2.data).slice(-18).every(Number.isNaN)
    ).toBe(true);
    const { createWebGpuMarkConfig } =
        await import("../rendering/webgpu/webGpuMarkAdapter.js");
    const { config } = createWebGpuMarkConfig(unit.mark, {}, unit.coords);
    const channels = /** @type {any} */ (config).channels;
    expect(channels.fill.data).toEqual(channels.x2.data);
    expect(Array.from(channels.fill.data).slice(-3).every(Number.isNaN)).toBe(
        true
    );
});

test("collected brush expressions must resolve the same bindings", async () => {
    const children = [0.2, 0.8].map((opacity, index) => {
        const child = /** @type {any} */ (spec());
        child.name = "source" + index;
        child.params[0].push = "outer";
        child.params[0].select.mark = { fillOpacity: { expr: "localOpacity" } };
        child.params.push({ name: "localOpacity", value: opacity });
        return child;
    });
    const input = {
        params: [{ name: "scores" }],
        resolve: { scale: { color: "shared" }, legend: { color: "shared" } },
        hconcat: children,
    };
    await expect(
        createTestEmbed(/** @type {any} */ (input), {
            contextOptions: { baseConfig },
        })
    ).rejects.toThrow(/conflicting interaction settings/);
    // Equal source text is compatible when both aliases actually read the same outer ref.
    for (const child of children) child.params.pop();
    await createTestEmbed(
        /** @type {any} */ ({
            ...input,
            params: [...input.params, { name: "localOpacity", value: 0.5 }],
        }),
        { contextOptions: { baseConfig } }
    );
});

test("rect appearance overrides update reactively and cleared feedback keeps its space", async () => {
    const input = spec();
    input.params.push(
        { name: "brushColor", value: "#663399" },
        { name: "brushAlpha", value: 0.25 },
        { name: "brushRadius", value: 2 }
    );
    const declaration =
        /** @type {import("../spec/parameter.js").GradientIntervalSelectionParameter<"color">} */ (
            input.params[0]
        );
    declaration.value = { color: [3, 30] };
    input.config.style = {
        reviewBrush: {
            fill: "#ffffff",
            strokeOpacity: 0.8,
            strokeWidth: 2,
            shadowOpacity: 0,
            clip: true,
        },
    };
    declaration.select.mark = {
        style: "reviewBrush",
        fillOpacity: { expr: "brushAlpha" },
        stroke: { expr: "brushColor" },
        cornerRadius: { expr: "brushRadius" },
    };
    const { root, views } = await createTestEmbed(input, {
        contextOptions: { baseConfig, viewFactoryOptions: { wrapRoot: true } },
    });
    renderToLayout(root);
    const params = views.get({ scope: [], view: "cells" }).params;
    const brush = /** @type {import("./unitView.js").default} */ (
        root.getDescendants().find((view) => view.name === "gradientBrush")
    );
    const feedback = root
        .getDescendants()
        .find((view) => view.name === "gradientSelectionFeedback");
    const feedbackBounds = [
        feedback.coords.x,
        feedback.coords.y,
        feedback.coords.width,
        feedback.coords.height,
    ];
    const svg = () =>
        createSvg({
            viewRoot: root,
            logicalWidth: 600,
            logicalHeight: 400,
            background: null,
        }).svg;
    expect(brush.mark.properties.clip).toBe(true);
    expect(
        /** @type {import("../spec/mark.js").RectProps} */ (
            brush.mark.properties
        ).shadowOpacity
    ).toBe(0);
    const row = Array.from(brush.getCollector().getData())[0];
    expect(brush.mark.encoders.stroke(row)).toBe("#663399");
    expect(brush.mark.encoders.fillOpacity(row)).toBe(0.25);
    expect(
        svg()
            .querySelector('[data-name="gradientBrush"] rect')
            .getAttribute("rx")
    ).toBe("2");
    params.get("brushColor").setValue("#cc3300");
    params.get("brushAlpha").setValue(0.5);
    params.get("brushRadius").setValue(4);
    expect(brush.mark.encoders.stroke(row)).toBe("#cc3300");
    expect(brush.mark.encoders.fillOpacity(row)).toBe(0.5);
    expect(
        svg()
            .querySelector('[data-name="gradientBrush"] rect')
            .getAttribute("rx")
    ).toBe("4");
    expect(svg().textContent).toContain("3 to <30");
    params.getSelection("scores").clear();
    renderToLayout(root);
    expect(
        Array.from(
            svg().querySelectorAll(
                '[data-name="gradientSelectionFeedback"] text'
            ),
            (element) => element.textContent
        ).join("")
    ).toBe("");
    expect([
        feedback.coords.x,
        feedback.coords.y,
        feedback.coords.width,
        feedback.coords.height,
    ]).toEqual(feedbackBounds);
});

test.each([false, true])(
    "range feedback can be disabled independently of brushing (vertical=%s)",
    async (vertical) => {
        const extents = [];
        for (const enabled of [true, false]) {
            const input = /** @type {any} */ (spec("linear", vertical));
            input.params[0].value = { color: [3, 30] };
            // Exercise per-legend settings and shared defaults without a configuration matrix.
            if (vertical) input.config.legend.selectionLabel = enabled;
            else {
                input.config.legend.selectionLabel = false;
                input.encoding.color.legend.selectionLabel = enabled;
            }
            const { root, views } = await createTestEmbed(input, {
                contextOptions: {
                    baseConfig,
                    viewFactoryOptions: { wrapRoot: true },
                },
            });
            renderToLayout(root);
            const host = rampHost(root, "cells");
            const ramp = root
                .getDescendants()
                .find((view) => view.name === "gradientRamp");
            const unit = root
                .getDescendants()
                .find((view) => view.name === "cells");
            expect(ramp.getScaleResolution("color")).toBe(
                unit.getScaleResolution("color")
            );
            extents.push(
                vertical
                    ? host.legend.getStackedParallelSize()
                    : host.legend.getPerpendicularSize()
            );
            const svg = createSvg({
                viewRoot: root,
                logicalWidth: 600,
                logicalHeight: 400,
                background: null,
            }).svg;
            expect(
                svg.querySelectorAll('[data-name="gradientSelectionFeedback"]')
            ).toHaveLength(enabled ? 1 : 0);
            expect(
                svg.querySelector('[data-name="gradientBrush"] rect')
            ).not.toBeNull();
            expect(
                svg.querySelector('[data-name="gradientLabels"] text')
            ).not.toBeNull();
            await host.start(0.5);
            host.move(1);
            host.end();
            const selected = views
                .get({ scope: [], view: "cells" })
                .params.getSelection("scores");
            if (selected.type !== "interval")
                throw new Error("Expected interval selection");
            expect(selected.getValue().intervals.color[1]).toBe(Infinity);
        }
        expect(extents[0] - extents[1]).toBe(20);
    }
);

test.each(
    /** @type {const} */ ([
        {
            type: "linear",
            domain: [2500, 6500],
            bounds: [4290, 5450],
            format: undefined,
            tick: "4,000",
            label: "4,290 to <5,450",
            open: ">= 4,290",
        },
        {
            type: "linear",
            domain: [0, 1],
            bounds: [0.25, 0.75],
            format: ".1%",
            tick: "20.0%",
            label: "25.0% to <75.0%",
            open: ">= 25.0%",
        },
        {
            type: "log",
            domain: [1, 100],
            bounds: [3, 30],
            format: undefined,
            tick: "10",
            label: "3 to <30",
            open: ">= 3",
        },
    ])
)(
    "range readout follows tick formatting ($type, $format)",
    async ({ type, domain, bounds, format, tick, label, open }) => {
        const input = spec(type);
        Object.assign(input.encoding.color, {
            scale: { type, domain: Array.from(domain) },
            format,
        });
        input.params[0].value = { color: Array.from(bounds) };
        const { root, views } = await createTestEmbed(input, {
            contextOptions: {
                baseConfig,
                viewFactoryOptions: { wrapRoot: true },
            },
        });
        renderToLayout(root);
        const svg = () =>
            createSvg({
                viewRoot: root,
                logicalWidth: 600,
                logicalHeight: 400,
                background: null,
            }).svg;
        const initial = svg();
        expect(
            Array.from(
                initial.querySelectorAll('[data-name="gradientLabels"] text'),
                (node) => node.textContent
            )
        ).toContain(tick);
        expect(
            initial.querySelector('[data-name="gradientSelectionFeedback"]')
                .textContent
        ).toContain(label);
        views
            .get({ scope: [], view: "cells" })
            .params.get("scores")
            .setValue(intervalSelection({ color: [bounds[0], Infinity] }));
        expect(
            svg().querySelector('[data-name="gradientSelectionFeedback"]')
                .textContent
        ).toContain(open);
    }
);
