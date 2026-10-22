// @vitest-environment jsdom

import { expect, onTestFinished, test } from "vitest";
import {
    createBroadcastingTestViewContext,
    createHeadlessEngine,
} from "./testUtils.js";
import AxisView, { orient2channel } from "./axisView.js";
import { createSvg } from "../rendering/svg/index.js";
import { resolveEmbedParam } from "../paramRuntime/embedParamApi.js";

/**
 * Open a real axis and let its tick sources observe the rendered dimensions.
 * Return the public parameter controls and an SVG drawing of the current state.
 * @param {import("../spec/root.js").RootSpec} spec
 */
async function createPlot(spec) {
    const context = createBroadcastingTestViewContext();
    const { view } = await createHeadlessEngine(spec, { context });
    onTestFinished(() => view.disposeSubtree());

    const draw = () =>
        createSvg({ viewRoot: view, logicalWidth: 400, logicalHeight: 240 })
            .svg;
    const render = async () => {
        draw();
        context.emitBroadcast(view, "layoutComputed");
        await view.paramRuntime.whenPropagated();
        return draw();
    };

    return {
        view,
        render,
        getParam: (/** @type {string} */ name) => resolveEmbedParam(view, name),
    };
}

const parts = {
    domain: '[data-name="domain"] line',
    ticks: '[data-name="ticks"] line',
    labels: '[data-name="labels_main"] text',
    grid: '[data-name="grid_lines"] line',
};

/** @param {import("../spec/axis.js").AxisOrient} orient */
function axisSpec(orient) {
    const channel = orient2channel(orient);
    return /** @type {import("../spec/root.js").RootSpec} */ ({
        name: "plot",
        params: Object.keys(parts).map((name) => ({ name, value: false })),
        data: { values: [{ value: 0 }, { value: 5 }, { value: 10 }] },
        mark: "point",
        encoding: {
            color: { value: "black" },
            [channel]: {
                field: "value",
                type: "quantitative",
                scale: { domain: [0, 10], zoom: true },
                axis: {
                    orient,
                    title: "Position",
                    domain: { expr: "domain" },
                    ticks: { expr: "ticks" },
                    labels: { expr: "labels" },
                    grid: { expr: "grid" },
                },
            },
        },
    });
}

test.each(/** @type {const} */ (["top", "bottom", "left", "right"]))(
    "%s axis parts toggle independently through embed params without changing navigation or layout",
    async (orient) => {
        const { view, render, getParam } = await createPlot(axisSpec(orient));
        const axis = /** @type {AxisView} */ (
            view.getDescendants().find((child) => child instanceof AxisView)
        );
        const resolution = axis.dataParent.getScaleResolution(
            orient2channel(orient)
        );
        await resolution.zoomTo([2, 8]);
        let svg = await render();
        const extent = axis.getPerpendicularSize();
        const scale = resolution.getScale();

        for (const selector of Object.values(parts)) {
            expect(svg.querySelectorAll(selector)).toHaveLength(0);
        }

        for (const name of Object.keys(parts)) getParam(name).setValue(true);
        svg = await render();
        for (const selector of Object.values(parts)) {
            expect(svg.querySelectorAll(selector).length).toBeGreaterThan(0);
        }

        // Each part can be hidden and restored while the other three remain drawn.
        for (const name of Object.keys(parts)) {
            getParam(name).setValue(false);
            svg = await render();
            for (const [other, selector] of Object.entries(parts)) {
                expect(svg.querySelectorAll(selector).length > 0).toBe(
                    other !== name
                );
            }
            getParam(name).setValue(true);
        }
        await render();

        expect(axis.getPerpendicularSize()).toBe(extent);
        expect(resolution.getDomain()).toEqual([2, 8]);
        expect(resolution.getScale()).toBe(scale);
        expect(svg.querySelector('[data-name="title"] text')?.textContent).toBe(
            "Position"
        );
    }
);

test("inherited axis expressions use the shared axis owner's parameter scope", async () => {
    const { view, getParam, render } = await createPlot({
        params: [{ name: "showLabels", value: false }],
        config: { axis: { labels: { expr: "showLabels" } } },
        resolve: { scale: { x: "shared" }, axis: { x: "shared" } },
        vconcat: [0, 1].map((value) => ({
            data: { values: [{ value }] },
            mark: "point",
            encoding: {
                color: { value: "black" },
                x: { field: "value", type: "quantitative" },
            },
        })),
    });
    expect((await render()).querySelectorAll(parts.labels)).toHaveLength(0);
    getParam("showLabels").setValue(true);
    expect(
        (await render()).querySelectorAll(parts.labels).length
    ).toBeGreaterThan(0);
    expect(
        view.getDescendants().filter((child) => child instanceof AxisView)
    ).toHaveLength(1);
});

test("domain expressions hide and restore every segment of a gapped index axis", async () => {
    const spec = axisSpec("bottom");
    spec.encoding.x = {
        ...spec.encoding.x,
        field: "value",
        type: "index",
        scale: { domain: [0, 10], gapPositions: [5], gapWidth: 6 },
    };
    const { getParam, render } = await createPlot(spec);

    expect((await render()).querySelectorAll(parts.domain)).toHaveLength(0);
    getParam("domain").setValue(true);
    expect((await render()).querySelectorAll(parts.domain)).toHaveLength(2);
    getParam("domain").setValue(false);
    expect((await render()).querySelectorAll(parts.domain)).toHaveLength(0);
});

test("locus axes toggle coordinate decorations while keeping chromosome labels", async () => {
    const spec = axisSpec("bottom");
    spec.encoding.x = { ...spec.encoding.x, field: "value", type: "locus" };
    const { getParam, render } = await createPlot(spec);
    expect((await render()).querySelectorAll(parts.labels)).toHaveLength(0);
    getParam("labels").setValue(true);
    const svg = await render();
    expect(svg.querySelectorAll(parts.labels).length).toBeGreaterThan(0);
    expect(
        svg.querySelectorAll('[data-name="chromosome_labels"] text').length
    ).toBeGreaterThan(0);
});
