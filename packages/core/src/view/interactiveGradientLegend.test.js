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
        expect(
            Array.from(unit.getCollector().getData(), (row) =>
                unit.mark.encoders.fillOpacity(row)
            )
        ).toEqual([0.15, 1, 1, 1, 0.15, 0.15]);
        params
            .get("scores")
            .setValue(intervalSelection({ color: [30, Infinity] }));
        expect(
            Array.from(unit.getCollector().getData(), (row) =>
                unit.mark.encoders.fillOpacity(row)
            )
        ).toEqual([0.15, 0.15, 0.15, 1, 1, 1]);
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
        expect(svg.textContent).toContain("≥ 30");
    }
);

test("log ramp gestures use exact inverse values, open the upper edge and cancel stale drags", async () => {
    const { root, views } = await createTestEmbed(spec("log"), {
        contextOptions: { baseConfig, viewFactoryOptions: { wrapRoot: true } },
    });
    renderToLayout(root);
    const legend = root
        .getDescendants()
        .find(
            (v) =>
                v.name.startsWith("legend_") &&
                v.paramRuntime.paramConfigs.has("legendCreating")
        );
    const runtime = views.get({ scope: [], view: "cells" }).params;
    const controller = /** @type {any} */ (
        root
            .getDescendants()
            .find((v) => v.name === "cells")
            .paramRuntime.getSelectionController("scores")
    );
    const coords = controller.host.getProjectionCoords("color");
    const start = (/** @type {number} */ fraction) => {
        const point = {
            x: coords.x + coords.width * fraction,
            y: coords.y + coords.height / 2,
        };
        const event = new MouseEvent("mousedown", {
            button: 0,
            clientX: point.x,
            clientY: point.y,
        });
        return { point, event };
    };
    const { point, event } = start(0.5);
    const { default: Interaction } = await import("../utils/interaction.js");
    const { default: Point } = await import("./layout/point.js");
    legend.propagateInteraction(
        new Interaction(new Point(point.x, point.y), event)
    );
    const end = start(1);
    document.dispatchEvent(
        new MouseEvent("mousemove", {
            clientX: end.point.x,
            clientY: end.point.y,
        })
    );
    document.dispatchEvent(new MouseEvent("mouseup"));
    const snapshot = runtime.getSelection("scores").getValue();
    expect(snapshot).toMatchObject({
        intervals: { color: [expect.closeTo(10), Infinity] },
    });
    runtime.getSelection("scores").clear();
    expect(runtime.getSelection("scores").getValue().active).toBe(false);
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
});
