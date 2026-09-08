// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import Interaction from "../utils/interaction.js";
import Point from "./layout/point.js";
import ConcatView from "./concatView.js";
import LegendView from "./legendView.js";
import UnitView from "./unitView.js";
import { createAndInitialize, renderToLayout } from "./testUtils.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createSvg } from "../rendering/svg/index.js";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";
import { DEFAULT_THEME_NAME, resolveThemeSelection } from "../config/themes.js";

const baseConfig = resolveBaseConfig({
    defaultConfig: INTERNAL_DEFAULT_CONFIG,
    builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
});

/** @typedef {import("../spec/channel.js").PrimaryPositionalChannel} Channel */

/** @param {Channel} channel */
function makeSpec(channel) {
    /** @type {import("../spec/view.js").UnitSpec} */
    const track = {
        width: 200,
        height: 60,
        data: { values: [{ position: 0 }, { position: 100 }] },
        mark: "point",
        encoding: {
            [channel]: {
                field: "position",
                type: "quantitative",
                scale: { domain: [0, 100] },
                axis: null,
            },
        },
    };
    /** @type {import("../spec/view.js").UnitSpec} */
    const annotation = {
        name: "regions",
        data: { values: [{ start: 20, end: 40 }] },
        mark: { type: "rect", fill: "orange", tooltip: null },
        encoding: {
            [channel]: { field: "start", type: "quantitative" },
            [channel === "x" ? "x2" : "y2"]: { field: "end" },
        },
    };
    return channel === "x"
        ? {
              vconcat: [structuredClone(track), structuredClone(track)],
              spacing: 30,
              annotate: [annotation],
          }
        : {
              hconcat: [structuredClone(track), structuredClone(track)],
              spacing: 30,
              annotate: [annotation],
          };
}

describe("container annotation contracts", () => {
    test("hosts annotation legends in the owning concat by default", async () => {
        const spec = /** @type {import("../spec/view.js").VConcatSpec} */ (
            makeSpec("x")
        );
        spec.config = { legend: { disable: false } };
        for (const trackSpec of spec.vconcat) {
            const track = /** @type {import("../spec/view.js").UnitSpec} */ (
                trackSpec
            );
            track.data = {
                values: [
                    { position: 0, group: "track A" },
                    { position: 100, group: "track B" },
                ],
            };
            track.encoding.fill = {
                field: "group",
                type: "nominal",
            };
        }
        const sourceAnnotation =
            /** @type {import("../spec/view.js").UnitSpec} */ (
                spec.annotate[0]
            );
        sourceAnnotation.data = {
            values: [
                { start: 20, end: 40, region: "A" },
                { start: 60, end: 80, region: "B" },
            ],
        };
        sourceAnnotation.encoding.fill = {
            field: "region",
            type: "nominal",
        };

        const view = await createAndInitialize(spec, ConcatView);
        renderToLayout(view);

        const track = view.children[0];
        const annotation = view.getAnnotationLayer().children[0];

        await view.syncGuideViews();
        await view.syncGuideViews();
        renderToLayout(view);

        const legends = view
            .getDescendants()
            .filter((descendant) => descendant instanceof LegendView);
        expect(legends).toHaveLength(3);
        expect(
            legends.filter((legend) =>
                legend.dataParent
                    .getLayoutAncestors()
                    .includes(view.getAnnotationLayer())
            )
        ).toHaveLength(1);
        expect(annotation.getScaleResolution("fill")).not.toBe(
            track.getScaleResolution("fill")
        );
        expect(annotation.getScaleResolution("fill").getDomain()).toEqual([
            "A",
            "B",
        ]);
        expect(track.getScaleResolution("fill").getDomain()).toEqual([
            "track A",
            "track B",
        ]);

        view.disposeSubtree();
    });

    test("shares annotation and track legends only when requested", async () => {
        const spec = /** @type {import("../spec/view.js").VConcatSpec} */ (
            makeSpec("x")
        );
        spec.config = { legend: { disable: false } };
        for (const trackSpec of spec.vconcat) {
            const track = /** @type {import("../spec/view.js").UnitSpec} */ (
                trackSpec
            );
            track.data = {
                values: [
                    { position: 0, region: "A" },
                    { position: 100, region: "B" },
                ],
            };
            track.encoding.fill = { field: "region", type: "nominal" };
        }
        const sourceAnnotation =
            /** @type {import("../spec/view.js").UnitSpec} */ (
                spec.annotate[0]
            );
        sourceAnnotation.data = {
            values: [
                { start: 20, end: 40, region: "A" },
                { start: 60, end: 80, region: "B" },
            ],
        };
        sourceAnnotation.encoding.fill = {
            field: "region",
            type: "nominal",
        };
        spec.resolve = { scale: { fill: "shared" } };

        const view = await createAndInitialize(spec, ConcatView);
        renderToLayout(view);

        const legends = view
            .getDescendants()
            .filter((descendant) => descendant instanceof LegendView);
        expect(legends).toHaveLength(1);
        expect(
            view.getAnnotationLayer().children[0].getScaleResolution("fill")
        ).toBe(view.children[0].getScaleResolution("fill"));

        view.disposeSubtree();
    });

    test.each(/** @type {const} */ (["x", "y"]))(
        "spans %s tracks and gaps through nested annotation layers",
        async (channel) => {
            const spec = makeSpec(channel);
            const annotation = spec.annotate[0];
            /** @type {import("../spec/view.js").LayerSpec} */
            const nested = { layer: [{ layer: [annotation] }] };
            const view = await createAndInitialize(
                { ...spec, annotate: [nested] },
                ConcatView
            );
            renderToLayout(view);
            const [first, second] = view.children;
            const layer = view.getAnnotationLayer();
            const unit = layer
                .getDescendants()
                .find((view) => view instanceof UnitView);
            expect(unit.getScaleResolution(channel)).toBe(
                first.getScaleResolution(channel)
            );
            expect(layer.coords.x).toBeCloseTo(first.coords.x);
            expect(layer.coords.y).toBeCloseTo(first.coords.y);
            expect(layer.coords.x2).toBeCloseTo(second.coords.x2);
            expect(layer.coords.y2).toBeCloseTo(second.coords.y2);
            const before = layer.coords;
            view.context.isViewConfiguredVisible = (view) =>
                view.isVisibleInSpec();
            second.spec.visible = false;
            view.invalidateSizeCache();
            renderToLayout(view);
            expect(layer.coords.width).toBeCloseTo(first.coords.width);
            expect(layer.coords.height).toBeCloseTo(first.coords.height);
            expect(
                channel === "x" ? before.height : before.width
            ).toBeGreaterThan(
                channel === "x" ? layer.coords.height : layer.coords.width
            );
            first.spec.visible = false;
            view.invalidateSizeCache();
            const layout = renderToLayout(view);
            expect(JSON.stringify(layout)).not.toContain('"regions"');
            view.disposeSubtree();
        }
    );

    test.each([{ annotate: undefined }, { annotate: [] }])(
        "omits the annotation layer for %j",
        async ({ annotate }) => {
            const view = await createAndInitialize(
                { ...makeSpec("x"), annotate },
                ConcatView
            );
            expect(view.getAnnotationLayer()).toBeUndefined();
            view.disposeSubtree();
        }
    );

    test("does not inherit track encodings and resolves annotation expressions in container scope", async () => {
        const spec = makeSpec("x");
        const view = await createAndInitialize(
            {
                ...spec,
                params: [{ name: "start", value: 25 }],
                data: { values: [{ position: 1 }] },
                encoding: { y: { field: "position", type: "quantitative" } },
                annotate: [
                    {
                        mark: "rect",
                        encoding: {
                            x: { expr: "start", type: "quantitative" },
                            x2: { value: 1 },
                        },
                    },
                ],
            },
            ConcatView
        );
        renderToLayout(view);
        const unit = view.getAnnotationLayer().children[0];
        expect(unit.getEncoding().y).toBeUndefined();
        expect(unit.paramRuntime.findValue("start")).toBe(25);
        view.disposeSubtree();
    });

    test("rejects independent track projections", async () => {
        const spec = makeSpec("x");
        const view = await createAndInitialize(
            { ...spec, resolve: { scale: { x: "independent" } } },
            ConcatView
        );
        expect(() => renderToLayout(view)).toThrow(/shared|align/);
        view.disposeSubtree();
    });

    test("does not create a data projection from annotations alone", async () => {
        const spec = makeSpec("x");
        for (const track of spec.vconcat) track.encoding.x = { value: 0.5 };
        await expect(
            (async () => {
                const view = await createAndInitialize(spec, ConcatView);
                try {
                    renderToLayout(view);
                } finally {
                    view.disposeSubtree();
                }
            })()
        ).rejects.toThrow(/shared.*scale|projection/);
    });

    test("rejects unequal plot ranges", async () => {
        const spec = makeSpec("x");
        const view = await createAndInitialize(
            {
                vconcat: [
                    spec.vconcat[0],
                    {
                        hconcat: spec.vconcat,
                        resolve: { scale: { x: "shared" } },
                    },
                ],
                annotate: spec.annotate,
            },
            ConcatView
        );
        expect(() => renderToLayout(view)).toThrow(/align/);
        view.disposeSubtree();
    });

    test("rejects an explicit independent nested annotation scale", async () => {
        const spec = makeSpec("x");
        await expect(
            createAndInitialize(
                {
                    ...spec,
                    annotate: [
                        {
                            layer: spec.annotate,
                            resolve: { scale: { x: "independent" } },
                        },
                    ],
                },
                ConcatView
            )
        ).rejects.toThrow(/independent/);
    });

    test("rejects a detached annotation projection", async () => {
        const spec = makeSpec("x");
        spec.annotate[0].resolve = { scale: { x: "excluded" } };
        await expect(
            (async () => {
                const view = await createAndInitialize(spec, ConcatView);
                try {
                    renderToLayout(view);
                } finally {
                    view.disposeSubtree();
                }
            })()
        ).rejects.toThrow(/scale|projection/);
    });

    test("rejects an annotation encoding that redirects the shared axis", async () => {
        const spec = makeSpec("x");
        spec.annotate[0].encoding.x = {
            field: "start",
            type: "quantitative",
            resolutionChannel: "y",
        };
        await expect(
            (async () => {
                const view = await createAndInitialize(spec, ConcatView);
                try {
                    renderToLayout(view);
                } finally {
                    view.disposeSubtree();
                }
            })()
        ).rejects.toThrow(/resolve through x/);
    });

    test("projects unscaled field positions relative to the whole container", async () => {
        const spec = makeSpec("x");
        spec.annotate[0].data = {
            values: [{ start: 20, end: 40, low: 0.25, high: 0.75 }],
        };
        spec.annotate[0].encoding.y = {
            field: "low",
            type: "quantitative",
            scale: null,
        };
        spec.annotate[0].encoding.y2 = {
            field: "high",
            type: "quantitative",
            scale: null,
        };
        const { view } = await createHeadlessEngine(spec, {
            contextOptions: { baseConfig },
        });
        const { svg } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 300,
        });
        const rect = svg.querySelector('[data-name="regions"] rect');
        const layer = /** @type {ConcatView} */ (view).getAnnotationLayer();
        expect(+rect.getAttribute("height")).toBeCloseTo(
            layer.coords.height / 2,
            0
        );
        expect(+rect.getAttribute("y")).toBeCloseTo(
            layer.coords.y + layer.coords.height / 4,
            0
        );
        view.disposeSubtree();
    });

    test("renders ordinary rule and text annotations after rectangles", async () => {
        const spec = makeSpec("x");
        const { view } = await createHeadlessEngine(
            {
                ...spec,
                annotate: [
                    spec.annotate[0],
                    {
                        layer: [
                            {
                                name: "boundary",
                                mark: "rule",
                                encoding: {
                                    x: { field: "start", type: "quantitative" },
                                },
                            },
                            {
                                name: "label",
                                mark: "text",
                                encoding: {
                                    x: { field: "start", type: "quantitative" },
                                    y: { value: 0.5 },
                                    text: { value: "Region" },
                                },
                            },
                        ],
                        data: { values: [{ start: 20 }] },
                    },
                ],
            },
            { contextOptions: { baseConfig } }
        );
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: 400,
            logicalHeight: 300,
        });
        expect(svg.querySelector('[data-name="boundary"] line')).not.toBeNull();
        expect(svg.querySelector('[data-name="label"] text').textContent).toBe(
            "Region"
        );
        expect(
            Array.from(svg.querySelectorAll("[data-mark-type]"))
                .slice(-3)
                .map((group) => group.getAttribute("data-mark-type"))
        ).toEqual(["rect", "rule", "text"]);
        expect(warnings).toEqual([]);
        view.disposeSubtree();
    });

    test.each([
        [true, false],
        [false, false],
        [true, true],
        [false, true],
    ])(
        "respects a nested parameter shadow (selection=%s, deep=%s)",
        async (isSelection, deep) => {
            const spec = makeSpec("x");
            /** @type {import("../spec/parameter.js").SelectionParameter<"interval">} */
            const param = {
                name: "region",
                select: {
                    type: "interval",
                    encodings: ["x"],
                    extent: "container",
                    on: "mousedown[event.shiftKey]",
                    zoom: false,
                },
            };
            /** @type {import("../spec/view.js").VConcatSpec} */
            const nested = {
                vconcat: spec.vconcat,
                params: [
                    isSelection
                        ? structuredClone(param)
                        : { name: "region", value: 7 },
                ],
            };
            const view = await createAndInitialize(
                {
                    params: [param],
                    vconcat: [deep ? { vconcat: [nested] } : nested],
                },
                ConcatView
            );
            renderToLayout(view);
            const child = /** @type {ConcatView} */ (view.children[0]);
            const inner = deep
                ? /** @type {ConcatView} */ (child.children[0])
                : child;
            const track = inner.children[0];
            const start = new Point(
                track.coords.x + track.coords.width * 0.2,
                track.coords.y + track.coords.height / 2
            );
            const end = new Point(start.x + 30, start.y);
            view.propagateInteraction(
                new Interaction(
                    start,
                    new MouseEvent("mousedown", {
                        clientX: start.x,
                        clientY: start.y,
                        shiftKey: true,
                    })
                )
            );
            document.dispatchEvent(
                new MouseEvent("mousemove", { clientX: end.x, clientY: end.y })
            );
            document.dispatchEvent(
                new MouseEvent("mouseup", { clientX: end.x, clientY: end.y })
            );
            expect(
                view.paramRuntime.findValue("region").intervals.x
            ).toBeNull();
            if (isSelection) {
                expect(
                    inner.paramRuntime.findValue("region").intervals.x[1]
                ).toBeGreaterThan(20);
            } else {
                expect(inner.paramRuntime.findValue("region")).toBe(7);
            }
            view.disposeSubtree();
        }
    );

    test("unclaimed annotation wheel gestures reach nested track navigation", async () => {
        const spec = makeSpec("x");
        for (const track of spec.vconcat) {
            track.encoding.x = {
                ...track.encoding.x,
                scale: { domain: [0, 100], zoom: true },
            };
        }
        const view = await createAndInitialize(
            { vconcat: [{ vconcat: spec.vconcat }], annotate: spec.annotate },
            ConcatView
        );
        renderToLayout(view);
        const annotation = /** @type {UnitView} */ (
            view.getAnnotationLayer().children[0]
        );
        view.context.getCurrentHover = () => ({
            mark: annotation.mark,
            datum: { start: 20, end: 40 },
            uniqueId: 1,
        });
        const zoom = vi.spyOn(view.getScaleResolution("x"), "zoom");
        const inner = /** @type {ConcatView} */ (view.children[0]);
        const point = new Point(
            inner.children[0].coords.x + 60,
            (inner.children[0].coords.y2 + inner.children[1].coords.y) / 2
        );
        view.propagateInteraction(
            new Interaction(point, new WheelEvent("wheel", { deltaY: -120 }))
        );
        expect(zoom).toHaveBeenCalledTimes(1);
        view.disposeSubtree();
    });

    test("container brushes and annotations share nested plot bounds after resize", async () => {
        const spec = makeSpec("x");
        const view = await createAndInitialize(
            {
                params: [
                    {
                        name: "region",
                        value: { x: [20, 40] },
                        select: {
                            type: "interval",
                            encodings: ["x"],
                            extent: "container",
                        },
                    },
                ],
                vconcat: [{ title: "Nested tracks", vconcat: spec.vconcat }],
                annotate: spec.annotate,
            },
            ConcatView
        );
        for (const width of [200, 120]) {
            const inner = /** @type {ConcatView} */ (view.children[0]);
            for (const track of inner.children) {
                track.spec.width = width;
                track.invalidateSizeCache();
            }
            renderToLayout(view);
            const annotation = view.getAnnotationLayer();
            const brush = view
                .getDescendants()
                .find(
                    (child) =>
                        child.name === "selectionRect" &&
                        child.dataParent === view
                );
            for (const dimension of /** @type {const} */ ([
                "x",
                "y",
                "width",
                "height",
            ])) {
                expect(brush.coords[dimension]).toBeCloseTo(
                    annotation.coords[dimension]
                );
            }
            expect(annotation.coords.width).toBeCloseTo(width);
        }
        view.disposeSubtree();
    });

    test("keeps annotation data and geometry through track insertion and removal", async () => {
        const spec = makeSpec("x");
        const view = await createAndInitialize(spec, ConcatView);
        renderToLayout(view);
        const annotation = view.getAnnotationLayer();
        const originalHeight = annotation.coords.height;
        await view.addChildSpec(structuredClone(spec.vconcat[0]));
        renderToLayout(view);
        expect(view.getAnnotationLayer()).toBe(annotation);
        expect(annotation.coords.height).toBeGreaterThan(originalHeight);
        await view.removeChildAt(2);
        renderToLayout(view);
        expect(annotation.coords.height).toBeCloseTo(originalHeight);
        view.disposeSubtree();
    });

    test.each(/** @type {const} */ (["x", "y"]))(
        "exports %s region geometry, clipping and front order",
        async (channel) => {
            const spec = makeSpec(channel);
            spec.annotate[0].zindex = -10;
            (spec.vconcat ?? spec.hconcat)[0].zindex = 100;
            const { view } = await createHeadlessEngine(spec, {
                contextOptions: { baseConfig },
            });
            const { svg, warnings } = createSvg({
                viewRoot: view,
                logicalWidth: 500,
                logicalHeight: 300,
            });
            const regionGroup = svg.querySelector('[data-name="regions"]');
            const rect = regionGroup.querySelector("rect");
            expect(rect).not.toBeNull();
            const concat = /** @type {ConcatView} */ (view);
            const [first, second] = concat.children;
            expect(
                +rect.getAttribute(channel === "x" ? "height" : "width")
            ).toBeCloseTo(
                channel === "x"
                    ? second.coords.y2 - first.coords.y
                    : second.coords.x2 - first.coords.x,
                0
            );
            const clippedGroup = rect.closest("[clip-path]");
            expect(clippedGroup).not.toBeNull();
            const clipId = clippedGroup.getAttribute("clip-path").slice(5, -1);
            const clipRect = svg.querySelector("#" + clipId + " rect");
            expect(+clipRect.getAttribute("width")).toBeCloseTo(
                second.coords.x2 - first.coords.x,
                0
            );
            expect(+clipRect.getAttribute("height")).toBeCloseTo(
                second.coords.y2 - first.coords.y,
                0
            );
            const groups = Array.from(svg.querySelectorAll("[data-mark-type]"));
            expect(groups.at(-1).getAttribute("data-mark-type")).toBe("rect");
            expect(warnings).toEqual([]);
            view.disposeSubtree();
        }
    );
});
