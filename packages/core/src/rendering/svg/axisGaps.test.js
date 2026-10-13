// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";
import { orient2channel } from "../../view/axisView.js";

/** @param {import("../../spec/axis.js").AxisOrient} orient
 * @param {import("../../spec/scale.js").Scale} [scale]
 */
async function createAxis(orient, scale = {}) {
    const channel = orient2channel(orient);
    const { view } = await createHeadlessEngine(
        {
            name: "plot",
            width: 100,
            height: 100,
            params: [
                { name: "cuts", value: [10] },
                { name: "width", value: 6 },
            ],
            data: { values: [{ value: 0 }, { value: 19 }] },
            mark: "point",
            encoding: {
                color: { value: "black" },
                [channel]: {
                    field: "value",
                    type: scale.type === "locus" ? "locus" : "index",
                    scale: {
                        domain: [0, 19],
                        gapPositions: { expr: "cuts" },
                        gapWidth: { expr: "width" },
                        ...scale,
                    },
                    axis: {
                        orient,
                        ticks: false,
                        labels: false,
                        title: null,
                        domainColor: "purple",
                        domainWidth: 2,
                    },
                },
            },
        },
        { contextOptions: { viewFactoryOptions: { wrapRoot: true } } }
    );
    onTestFinished(() => view.disposeSubtree());
    const source = view.getDescendants().find((v) => v.name === "groups")
        ?.flowHandle.dataSource;
    const draw = () =>
        createSvg({ viewRoot: view, logicalWidth: 100, logicalHeight: 100 })
            .svg;
    const intervals = () =>
        Array.from(
            draw().querySelectorAll('[data-name="domain"] line'),
            (line) =>
                [
                    Number(line.getAttribute(channel + "1")),
                    Number(line.getAttribute(channel + "2")),
                ].sort((a, b) => a - b)
        ).sort((a, b) => a[0] - b[0]);
    return {
        view: view.getDescendants().find((v) => v.name === "plot"),
        source,
        draw,
        intervals,
        resolution: view.getScaleResolution(channel),
    };
}

test.each(["top", "bottom", "left", "right"])(
    "%s domain has styled pieces around gaps",
    async (orient) => {
        const { draw, intervals } = await createAxis(
            /** @type {import("../../spec/axis.js").AxisOrient} */ (orient)
        );
        expect(intervals()).toEqual([
            [0, 47],
            [53, 100],
        ]);
        const group = draw().querySelector(
            '[data-name="domain"] line'
        ).parentElement;
        expect(group.getAttribute("stroke")).toBe("purple");
        expect(group.getAttribute("stroke-width")).toBe("2");
    }
);

test("navigation clips groups without rebuilding them; reactive disablement restores the line", async () => {
    const { view, source, intervals, resolution } = await createAxis("bottom", {
        zoom: true,
    });
    const complete = vi.spyOn(source, "complete");
    await resolution.zoomTo([5, 14]);
    expect(intervals()).toEqual([
        [0, 47],
        [53, 100],
    ]);
    await resolution.zoomTo([11, 14]);
    expect(intervals()).toEqual([[0, 100]]);
    expect(complete).not.toHaveBeenCalled();
    await resolution.zoomTo([0, 19]);
    for (const [
        width,
        cuts,
        count,
    ] of /** @type {[number, number[], number][]} */ ([
        [0, [10], 1],
        [6, [], 1],
        [6, [10], 2],
    ])) {
        view.paramRuntime.setValue("width", width);
        view.paramRuntime.setValue("cuts", cuts);
        view.paramRuntime.flushNow();
        expect(intervals()).toHaveLength(count);
    }
});

test.each([
    { gapWidth: 0 },
    { gapWidth: null },
    { gapPositions: [] },
    { gapPositions: null },
])("constant-disabled gaps omit group sources: %j", async (scale) => {
    const { source, intervals } = await createAxis("bottom", scale);
    expect(source).toBeUndefined();
    expect(intervals()).toEqual([[0, 100]]);
});
