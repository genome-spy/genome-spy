// @vitest-environment jsdom

import { expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { INTERNAL_DEFAULT_CONFIG } from "../../config/defaultConfig.js";
import { resolveBaseConfig } from "../../config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "../../config/themes.js";
import { createSvg } from "./index.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

/** @param {import("../../spec/root.js").RootSpec} spec */
async function createPlot(spec) {
    /** @type {Set<(message: import("../../view/view.js").BroadcastMessage) => void>} */
    const listeners = new Set();
    const { view } = await createHeadlessEngine(spec, {
        contextOptions: {
            baseConfig,
            viewFactoryOptions: { wrapRoot: true },
            addBroadcastListener: (type, listener) => {
                if (type === "layoutComputed") listeners.add(listener);
            },
            removeBroadcastListener: (type, listener) => {
                if (type === "layoutComputed") listeners.delete(listener);
            },
        },
    });
    return {
        view,
        render: async () => {
            const draw = () =>
                createSvg({
                    viewRoot: view,
                    logicalWidth: 400,
                    logicalHeight: 160,
                }).svg;
            // Tick and label sources refresh after the browser publishes settled layout.
            draw();
            view.visit((child) =>
                child.handleBroadcast({ type: "layoutComputed" })
            );
            for (const listener of listeners)
                listener({ type: "layoutComputed" });
            await view.paramRuntime.whenPropagated();
            return draw();
        },
    };
}

/** @param {SVGSVGElement} svg */
function labels(svg) {
    return Array.from(svg.querySelectorAll("text"), (element) =>
        element.textContent.trim()
    );
}

test("a locus axis renders without genomic encodings", async () => {
    const { view, render } = await createPlot({
        scales: { x: { type: "locus" } },
        data: { values: [{}] },
        mark: { type: "text", text: "Scale bar" },
    });
    try {
        const svg = await render();
        expect(labels(svg)).toContain("Scale bar");
        expect(
            svg.querySelector('[data-name="chromosome_labels"] text')
                ?.textContent
        ).toBe("chr1");
        expect(
            svg.querySelectorAll('[data-name="chromosome_labels"] text').length
        ).toBeGreaterThan(0);
    } finally {
        view.disposeSubtree();
    }
});

test("an empty container's shared axis survives track replacement and follows zoom", async () => {
    const { view, render } = await createPlot({
        name: "tracks",
        scales: { x: { type: "linear", domain: [0, 100], zoom: true } },
        axes: { x: { title: "Position", values: [0, 20, 40, 100] } },
        resolve: { scale: { x: "shared" }, axis: { x: "shared" } },
        vconcat: [],
    });
    const container =
        /** @type {import("../../view/concatView.js").default} */ (
            view.getDescendants().find((child) => child.name === "tracks")
        );
    try {
        const axis = container.getAxisResolution("x");
        const scale = axis.scaleResolution;
        expect(labels(await render())).toEqual(
            expect.arrayContaining(["Position", "0", "100"])
        );
        await scale.zoomTo([20, 40]);
        expect(labels(await render())).toEqual(
            expect.arrayContaining(["20", "40"])
        );
        expect(labels(await render())).not.toContain("100");

        // The shared axis belongs to the container, even between successive tracks.
        for (let i = 0; i < 2; i++) {
            await container.addChildSpec({
                data: { values: [{ x: 30 }] },
                mark: "point",
                encoding: { x: { field: "x", type: "quantitative" } },
            });
            expect(container.getAxisResolution("x")).toBe(axis);
            expect((await render()).querySelectorAll("circle")).toHaveLength(1);
            await container.removeChildAt(0);
            expect(container.getAxisResolution("x")).toBe(axis);
            expect(scale.getDomain()).toEqual([20, 40]);
            expect(labels(await render())).toEqual(
                expect.arrayContaining(["Position", "20", "40"])
            );
        }
    } finally {
        view.disposeSubtree();
    }
    expect(container.getAxisResolution("x")).toBeUndefined();
});

test("independent declared scales draw separate axes", async () => {
    const { view, render } = await createPlot({
        resolve: {
            scale: { x: "independent" },
            axis: { x: "independent" },
        },
        vconcat: [10, 100].map((end) => ({
            height: 30,
            scales: { x: { type: "linear", domain: [0, end] } },
            axes: { x: { title: "Range " + end, values: [0, end] } },
            data: { values: [{}] },
            mark: "point",
        })),
    });
    try {
        expect(labels(await render())).toEqual(
            expect.arrayContaining(["Range 10", "Range 100", "10", "100"])
        );
    } finally {
        view.disposeSubtree();
    }
});

test("inferred scales release their axes and allow replacement", async () => {
    const { view, render } = await createPlot({
        name: "tracks",
        resolve: { scale: { x: "shared" }, axis: { x: "shared" } },
        vconcat: [],
    });
    const container =
        /** @type {import("../../view/concatView.js").default} */ (
            view.getDescendants().find((child) => child.name === "tracks")
        );
    try {
        for (const title of ["First", "Replacement"]) {
            await container.addChildSpec({
                data: { values: [{ x: 5 }] },
                mark: "point",
                encoding: { x: { field: "x", type: "quantitative", title } },
            });
            expect(labels(await render())).toContain(title);
            await container.removeChildAt(0);
            expect(container.getScaleResolution("x")).toBeUndefined();
            expect(container.getAxisResolution("x")).toBeUndefined();
            expect(labels(await render())).not.toContain(title);
        }
    } finally {
        view.disposeSubtree();
    }
});

test("independent declared scales cannot share an axis", async () => {
    await expect(
        createPlot({
            resolve: { scale: { x: "independent" }, axis: { x: "shared" } },
            vconcat: [10, 100].map((end) => ({
                scales: { x: { type: "linear", domain: [0, end] } },
                data: { values: [{}] },
                mark: "point",
            })),
        })
    ).rejects.toThrow("Shared axes must have a shared scale!");
});

test("a shared axis rejects a scale declared below its placement host", async () => {
    await expect(
        createPlot({
            resolve: { axis: { x: "shared" } },
            vconcat: [
                {
                    scales: { x: { type: "linear", domain: [0, 100] } },
                    resolve: { axis: { x: "shared" } },
                    vconcat: [],
                },
            ],
        })
    ).rejects.toThrow(
        "Declare or share the x scale at the axis host or an ancestor."
    );
});

test.each(["unit", "layer"])(
    "a standalone %s view uses its declared scale for position ticks",
    async (composition) => {
        const mark = { mark: /** @type {const} */ ("point") };
        const { view, render } = await createPlot({
            name: "plot",
            scales: { x: { type: "locus" } },
            resolve: { scale: { x: "shared" }, axis: { x: "shared" } },
            data: { values: [{}] },
            ...(composition === "unit" ? mark : { layer: [mark] }),
        });
        try {
            const plot = view
                .getDescendants()
                .find((child) => child.name === "plot");
            const scale = plot.getScaleResolution("x");
            await scale.zoomTo([0, 1000000]);
            const svg = await render();
            expect(scale.getAxisLength()).toBeGreaterThan(0);
            expect(labels(svg)).toContain("200,000");
            // The implicit wrapper must not create a second scale for the guides.
            expect(view.getScaleResolution("x")).toBeUndefined();
        } finally {
            view.disposeSubtree();
        }
    }
);
