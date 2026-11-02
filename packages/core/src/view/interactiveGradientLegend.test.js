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
                        { activation: 3 },
                        { activation: 100 },
                        { activation: 120 },
                        { activation: null },
                        { activation: Infinity },
                    ],
                },
                transform: [
                    {
                        type: "filter",
                        param: "scores",
                        fields: { color: "activation" },
                    },
                ],
                mark: "point",
                encoding: {
                    fill: {
                        field: "activation",
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
    expect(rows.map((row) => row.activation)).toEqual([3]);
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
        Array.from(other.getCollector().getData(), (row) => row.activation)
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
