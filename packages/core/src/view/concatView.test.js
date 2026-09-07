import { describe, expect, test, vi } from "vitest";

import ConcatView from "./concatView.js";
import UnitView from "./unitView.js";
import {
    createAndInitialize,
    createTestViewContext,
    renderToLayout,
} from "./testUtils.js";

/**
 * @returns {import("../spec/view.js").UnitSpec}
 */
const makeUnitSpec = () => ({
    data: {
        values: [
            {
                x: 1,
                y: 2,
            },
        ],
    },
    mark: "point",
    encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
    },
});

/**
 * @returns {import("../spec/view.js").UnitSpec}
 */
const makeEncodingInheritedUnitSpec = () => ({
    data: {
        values: [
            {
                id: "a",
                x: 1,
                y: 2,
            },
        ],
    },
    mark: "point",
});

describe("ConcatView dynamic children", () => {
    test("addChildSpec inserts at index and updates spec order", async () => {
        const context = createTestViewContext();
        context.requestLayoutReflow = vi.fn();

        const parent = new ConcatView(
            { vconcat: [] },
            context,
            null,
            null,
            "concat"
        );

        const first = makeUnitSpec();
        const second = makeUnitSpec();

        await parent.addChildSpec(first);
        await parent.addChildSpec(second, 0);

        // The spec order should mirror the view order for deterministic updates.
        expect(
            /** @type {import("../spec/view.js").VConcatSpec} */ (parent.spec)
                .vconcat
        ).toEqual([second, first]);
        expect(parent.children.map((view) => view.spec)).toEqual([
            second,
            first,
        ]);

        // Dynamic insertion should request layout reflow for updated sizes.
        expect(context.requestLayoutReflow).toHaveBeenCalled();
    });

    test("removeChildAt disposes subtree and updates specs", async () => {
        const context = createTestViewContext();
        context.requestLayoutReflow = vi.fn();

        const parent = new ConcatView(
            { vconcat: [] },
            context,
            null,
            null,
            "concat"
        );

        const first = await parent.addChildSpec(makeUnitSpec());
        await parent.addChildSpec(makeUnitSpec());

        await parent.removeChildAt(0);

        // Removing a child should dispose its flow handle to avoid leaks.
        expect(first.flowHandle).toBeUndefined();
        expect(
            /** @type {import("../spec/view.js").VConcatSpec} */ (parent.spec)
                .vconcat
        ).toHaveLength(1);
        expect(context.requestLayoutReflow).toHaveBeenCalled();
    });

    test("shared axes are removed when the last child is removed", async () => {
        const context = createTestViewContext();

        const parent = new ConcatView(
            {
                vconcat: [],
                resolve: {
                    axis: { x: "shared", y: "shared" },
                    scale: { x: "shared", y: "shared" },
                },
            },
            context,
            null,
            null,
            "concat"
        );

        await parent.addChildSpec(makeUnitSpec());

        const axesAfterAdd = parent
            .getDescendants()
            .filter((view) => view.name.startsWith("axis_"));
        expect(axesAfterAdd).toHaveLength(2);

        await parent.removeChildAt(0);

        // Shared axes should disappear when no members remain.
        const axesAfterRemove = parent
            .getDescendants()
            .filter((view) => view.name.startsWith("axis_"));
        expect(axesAfterRemove).toHaveLength(0);
    });

    test("removeChildAt throws for invalid index", async () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { vconcat: [] },
            context,
            null,
            null,
            "concat"
        );

        // Explicitly reject out-of-range removal to keep state consistent.
        await expect(parent.removeChildAt(0)).rejects.toThrow(
            "Child index out of range!"
        );
    });

    test("addChildSpec returns a unit view for unit specs", async () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            { vconcat: [] },
            context,
            null,
            null,
            "concat"
        );

        const view = await parent.addChildSpec(makeUnitSpec());

        // Consumers may need the created view to attach additional behavior.
        expect(view).toBeInstanceOf(UnitView);
    });

    test("addChildSpec children inherit the concat view's encoding", async () => {
        const context = createTestViewContext();
        const parent = new ConcatView(
            {
                encoding: {
                    key: { field: "id" },
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
                vconcat: [],
            },
            context,
            null,
            null,
            "concat"
        );

        const childView = await parent.addChildSpec(
            makeEncodingInheritedUnitSpec()
        );

        expect(childView.getEncoding()).toEqual({
            key: { field: "id" },
            x: { field: "x", type: "quantitative", buildIndex: true },
            y: { field: "y", type: "quantitative" },
        });
    });
});

describe("ConcatView annotations", () => {
    test("creates a front layer with an inert shared position and local styles", async () => {
        const view = await createAndInitialize(
            {
                vconcat: [
                    {
                        data: { values: [{ x: 0 }, { x: 10 }] },
                        mark: "point",
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                axis: null,
                            },
                            y: {
                                value: 0.5,
                                axis: null,
                            },
                        },
                    },
                ],
                annotate: [
                    {
                        data: {
                            values: [{ start: 100, end: 200, kind: "region" }],
                        },
                        mark: { type: "rect", opacity: 0.2 },
                        encoding: {
                            x: {
                                field: "start",
                                type: "quantitative",
                            },
                            x2: { field: "end" },
                            y: { value: 0 },
                            y2: { value: 1 },
                            color: { field: "kind", type: "nominal" },
                        },
                    },
                ],
            },
            ConcatView
        );

        renderToLayout(view);

        const annotationLayer = view.getAnnotationLayer();
        expect(annotationLayer).toBeDefined();
        expect(annotationLayer.children).toHaveLength(1);
        expect(annotationLayer.children[0].getEncoding()).toMatchObject({
            x: { field: "start", domainInert: true },
            x2: { field: "end", domainInert: true },
            y: { value: 0 },
            y2: { value: 1 },
        });
        expect(annotationLayer.children[0].getScaleResolution("x")).toBe(
            view.getScaleResolution("x")
        );
        expect(view.getScaleResolution("x").getDomain()).toEqual([0, 10]);
        expect(
            annotationLayer.children[0].getScaleResolution("color").getDomain()
        ).toEqual(["region"]);
        expect(annotationLayer.coords.width).toBeGreaterThan(0);
    });

    test("requires unscaled perpendicular field positions", async () => {
        await expect(
            createAndInitialize(
                {
                    vconcat: [makeUnitSpec()],
                    annotate: [
                        {
                            data: { values: [{ y: 0.5 }] },
                            mark: "point",
                            encoding: {
                                x: { value: 0.5 },
                                y: { field: "y", type: "quantitative" },
                            },
                        },
                    ],
                },
                ConcatView
            )
        ).rejects.toThrow("must use scale: null");
    });
});
