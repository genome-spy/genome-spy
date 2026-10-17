// @vitest-environment jsdom

import { expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { LegendRegionView } from "../../view/legendView.js";
import { createSvg } from "./index.js";

/** @returns {import("../../spec/root.js").RootSpec} */
function fixture() {
    return {
        params: [{ name: "showLegends", value: true }],
        config: {
            view: { stroke: "#abcdef" },
            legend: {
                disable: { expr: "!showLegends" },
                labelColor: "black",
                titleColor: "black",
                padding: 6,
                backgroundFill: "#ffffff",
                backgroundFillOpacity: 0.8,
                backgroundStroke: "#cc0000",
                backgroundStrokeOpacity: 0.7,
                backgroundStrokeWidth: 2,
            },
        },
        vconcat: [
            {
                width: 160,
                height: 160,
                data: {
                    values: [
                        { category: "a", kind: "gain" },
                        { category: "b", kind: "loss" },
                    ],
                },
                mark: "point",
                encoding: {
                    color: { field: "category", type: "nominal" },
                    shape: { field: "kind", type: "nominal" },
                },
            },
        ],
    };
}

test("paints stacked legend backgrounds and strokes around padded content", async () => {
    const { view } = await createHeadlessEngine(fixture());
    const render = () =>
        createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 240,
            background: null,
        });
    const { svg, warnings } = render();
    const region = svg.querySelector('[data-name="legend_region_right"]');
    const fills = region.querySelectorAll(
        '[data-mark-type="rect"][fill="#ffffff"]'
    );
    const strokes = region.querySelectorAll(
        '[data-mark-type="rule"][stroke="#cc0000"]'
    );
    const symbols = region.querySelectorAll(
        '[data-name="symbols"] [data-mark-type="point"]'
    );
    const titles = region.querySelectorAll('[data-name="title"] text');

    expect(fills).toHaveLength(2);
    expect(strokes).toHaveLength(2);
    expect(symbols).toHaveLength(2);
    expect(titles).toHaveLength(2);
    for (const [index, fill] of fills.entries()) {
        const rect = fill.querySelector("rect");
        const titleX = Number(
            titles[index].getAttribute("transform").match(/translate\((\S+)/)[1]
        );
        expect(Number(rect.getAttribute("width"))).toBeGreaterThan(12);
        expect(Number(rect.getAttribute("height"))).toBeGreaterThan(12);
        expect(titleX - Number(rect.getAttribute("x"))).toBe(6);
        expect(fill.getAttribute("fill-opacity")).toBe("0.8");
        expect(strokes[index].querySelectorAll("line")).toHaveLength(4);
        expect(strokes[index].getAttribute("stroke-opacity")).toBe("0.7");
        expect(strokes[index].getAttribute("stroke-width")).toBe("2");
        expect(
            fill.compareDocumentPosition(symbols[index]) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    }
    expect(region.querySelector('[stroke="#abcdef"]')).toBeNull();
    expect(warnings).toEqual([]);

    for (const [visible, count] of /** @type {[boolean, number][]} */ ([
        [false, 0],
        [true, 2],
    ])) {
        view.paramRuntime.setValue("showLegends", visible);
        await view.paramRuntime.whenPropagated();
        const { svg } = render();
        expect(
            svg.querySelectorAll('[data-mark-type="rect"][fill="#ffffff"]')
        ).toHaveLength(count);
        expect(svg.querySelectorAll('[data-name="symbols"]')).toHaveLength(
            count
        );
    }
    view.disposeSubtree();
});

test("disposes each legend subtree and its reactive visibility subscription", async () => {
    const { view, context } = await createHeadlessEngine(fixture());
    const region = view
        .getDescendants()
        .find((descendant) => descendant instanceof LegendRegionView);
    const disposed = region.getDescendants().map(() => vi.fn());
    region.getDescendants().forEach((descendant, index) => {
        descendant.registerDisposer(disposed[index]);
    });
    context.requestLayoutReflow = vi.fn();

    view.paramRuntime.setValue("showLegends", false);
    await view.paramRuntime.whenPropagated();
    expect(context.requestLayoutReflow).toHaveBeenCalled();

    region.disposeSubtree();
    expect(disposed.length).toBeGreaterThan(0);
    expect(disposed.every((dispose) => dispose.mock.calls.length === 1)).toBe(
        true
    );
    vi.mocked(context.requestLayoutReflow).mockClear();
    view.paramRuntime.setValue("showLegends", true);
    await view.paramRuntime.whenPropagated();
    expect(context.requestLayoutReflow).not.toHaveBeenCalled();
});
