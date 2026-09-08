// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import ConcatView from "./concatView.js";
import LegendView, { LegendRegionView } from "./legendView.js";
import { createAndInitialize, renderToLayout } from "./testUtils.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";
import { DEFAULT_THEME_NAME, resolveThemeSelection } from "../config/themes.js";
import { createSvg } from "../rendering/svg/index.js";
import { syncViewGuideViews } from "./gridView/guideViewSync.js";

/** @returns {import("../spec/view.js").UnitSpec} */
function track() {
    return {
        width: 180,
        height: 70,
        mark: "point",
        data: {
            values: [
                { x: 0, category: "track A" },
                { x: 100, category: "track B" },
            ],
        },
        encoding: {
            x: { field: "x", type: "quantitative", axis: null },
            color: { field: "category", type: "nominal" },
        },
    };
}

/**
 * @param {string} category
 * @returns {import("../spec/view.js").UnitSpec}
 */
function annotation(category) {
    return {
        mark: "rect",
        data: { values: [{ start: 20, end: 40, category }] },
        encoding: {
            x: { field: "start", type: "quantitative" },
            x2: { field: "end" },
            color: { field: "category", type: "nominal" },
        },
    };
}

/** @returns {import("../spec/view.js").VConcatSpec} */
function fixture() {
    return {
        config: { legend: { disable: false } },
        vconcat: [track(), track()],
        annotate: [annotation("region A"), annotation("region B")],
    };
}

/** @param {import("./view.js").default} view */
function legends(view) {
    return view.getDescendants().filter((child) => child instanceof LegendView);
}

/** @param {ConcatView} view */
function hostedLegends(view) {
    return Array.from(view)
        .filter((child) => child instanceof LegendRegionView)
        .flatMap((region) => legends(region));
}

/** @param {ConcatView} view */
function annotationScale(view) {
    return view.getAnnotationLayer().children[0].getScaleResolution("color");
}

describe("annotation legend routing", () => {
    test("keeps annotation mappings shared within the implicit layer and independent of tracks", async () => {
        const view = await createAndInitialize(fixture(), ConcatView);
        expect(legends(view)).toHaveLength(3);
        expect(hostedLegends(view)).toHaveLength(3);
        const scale = annotationScale(view);
        expect(scale).toBe(
            view.getAnnotationLayer().children[1].getScaleResolution("color")
        );
        expect(scale).not.toBe(view.children[0].getScaleResolution("color"));
        expect(scale.getDomain()).toEqual(["region A", "region B"]);
        expect(
            view.children[0].getScaleResolution("color").getDomain()
        ).toEqual(["track A", "track B"]);
        // Both ordinary and whole-tree guide refreshes must preserve the host.
        await view.syncGuideViews();
        await syncViewGuideViews(view);
        expect(legends(view)).toHaveLength(3);
        expect(hostedLegends(view)).toHaveLength(3);
        view.disposeSubtree();
    });

    test.each([false, true])(
        "outer collection respects annotation exclusion: %s",
        async (excluded) => {
            const innerSpec = fixture();
            if (excluded) {
                for (const entry of innerSpec.annotate)
                    entry.resolve = { legend: { color: "excluded" } };
            }
            const view = await createAndInitialize(
                {
                    config: { legend: { disable: false } },
                    resolve: { legend: { color: "collected" } },
                    vconcat: [innerSpec],
                },
                ConcatView
            );
            const inner = /** @type {ConcatView} */ (view.children[0]);
            expect(hostedLegends(view)).toHaveLength(excluded ? 2 : 3);
            // Excluding each entry creates independent legend owners over the same scale.
            expect(hostedLegends(inner)).toHaveLength(excluded ? 2 : 0);
            await syncViewGuideViews(view);
            expect(hostedLegends(view)).toHaveLength(excluded ? 2 : 3);
            expect(hostedLegends(inner)).toHaveLength(excluded ? 2 : 0);
            view.disposeSubtree();
        }
    );

    test.each(/** @type {const} */ (["independent", "excluded"]))(
        "explicit annotation layer supports %s color",
        async (behavior) => {
            const spec = fixture();
            spec.annotate = [
                {
                    layer: spec.annotate,
                    resolve: { scale: { color: behavior } },
                },
            ];
            const view = await createAndInitialize(spec, ConcatView);
            expect(hostedLegends(view)).toHaveLength(
                behavior === "independent" ? 4 : 3
            );
            expect(legends(view)).toHaveLength(
                behavior === "independent" ? 4 : 3
            );
            view.disposeSubtree();
        }
    );

    test("shared color merges annotation and track domains only when requested", async () => {
        const spec = fixture();
        spec.resolve = { scale: { color: "shared" } };
        const view = await createAndInitialize(spec, ConcatView);
        expect(legends(view)).toHaveLength(1);
        expect(annotationScale(view)).toBe(
            view.children[0].getScaleResolution("color")
        );
        expect(annotationScale(view).getDomain()).toEqual([
            "track A",
            "track B",
            "region A",
            "region B",
        ]);
        view.disposeSubtree();
    });

    test("legend suppression does not change annotation scale participation", async () => {
        const spec = fixture();
        for (const entry of spec.annotate)
            entry.encoding.color = {
                field: "category",
                type: "nominal",
                legend: null,
            };
        const view = await createAndInitialize(spec, ConcatView);
        expect(hostedLegends(view)).toHaveLength(2);
        expect(legends(view)).toHaveLength(2);
        expect(annotationScale(view).getDomain()).toEqual([
            "region A",
            "region B",
        ]);
        view.disposeSubtree();
    });

    test("track mutation and resizing preserve one annotation legend and aligned plots", async () => {
        const view = await createAndInitialize(fixture(), ConcatView);
        await view.addChildSpec(track());
        expect(legends(view)).toHaveLength(4);
        await view.removeChildAt(2);
        expect(legends(view)).toHaveLength(3);
        for (const width of [180, 260]) {
            for (const child of view.children) {
                child.spec.width = width;
                child.invalidateSizeCache();
            }
            renderToLayout(view);
            expect(view.getAnnotationLayer().coords.width).toBeCloseTo(width);
            expect(hostedLegends(view)).toHaveLength(3);
        }
        view.disposeSubtree();
    });
});

test.each([false, true])(
    "exports annotation legends beside the complete concat, horizontal: %s",
    async (horizontal) => {
        const spec = fixture();
        if (horizontal) {
            for (const child of [...spec.vconcat, ...spec.annotate]) {
                const entry =
                    /** @type {import("../spec/view.js").UnitSpec} */ (child);
                entry.encoding.y = entry.encoding.x;
                delete entry.encoding.x;
                if (entry.encoding.x2) {
                    entry.encoding.y2 = entry.encoding.x2;
                    delete entry.encoding.x2;
                }
            }
        }
        const { view: root } = await createHeadlessEngine(
            horizontal
                ? {
                      config: spec.config,
                      hconcat: spec.vconcat,
                      annotate: spec.annotate,
                  }
                : spec,
            {
                contextOptions: {
                    baseConfig: resolveBaseConfig({
                        defaultConfig: INTERNAL_DEFAULT_CONFIG,
                        builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
                    }),
                },
            }
        );
        const view = /** @type {ConcatView} */ (root);
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 600,
            logicalHeight: 300,
        });
        expect(warnings).toEqual([]);
        const labels = Array.from(svg.querySelectorAll("text")).map(
            (text) => text.textContent
        );
        expect(labels).toContain("region A");
        expect(labels).toContain("region B");
        expect(legends(view)).toHaveLength(3);
        const annotationLayer = view.getAnnotationLayer();
        const legend = legends(view).find((legend) =>
            legend.getDataAncestors().includes(annotationLayer)
        );
        expect(legend.coords.x).toBeGreaterThanOrEqual(
            annotationLayer.coords.x2
        );
        view.disposeSubtree();
    }
);

test("non-positional aliases retain ordinary legend and scale sharing", async () => {
    const spec = fixture();
    spec.annotate[0].encoding.fill = {
        field: "category",
        type: "nominal",
        resolutionChannel: "color",
    };
    delete spec.annotate[0].encoding.color;
    const view = await createAndInitialize(spec, ConcatView);
    expect(legends(view)).toHaveLength(3);
    expect(annotationScale(view).getDomain()).toEqual(["region A", "region B"]);
    expect(annotationScale(view)).toBe(
        view.getAnnotationLayer().children[1].getScaleResolution("color")
    );
    view.disposeSubtree();
});

test.each(/** @type {const} */ (["x", "y"]))(
    "styling aliases cannot join positional %s scales",
    async (channel) => {
        const spec = fixture();
        spec.annotate[0].encoding.color = {
            field: "start",
            type: "quantitative",
            resolutionChannel: channel,
        };
        await expect(createAndInitialize(spec, ConcatView)).rejects.toThrow(
            /cannot resolve through positional channel/
        );
    }
);
