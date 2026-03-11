// @ts-nocheck

import { describe, expect, test, vi } from "vitest";

import ConcatView from "../view/concatView.js";
import {
    getRequiredScaleResolution,
    initView,
} from "./scaleResolutionTestUtils.js";

/**
 * @param {import("../spec/scale.js").Scale["domain"]} domain
 * @param {boolean} [linkZoom]
 */
function createLinkedDomainSpec(domain, linkZoom = true) {
    return {
        params: [{ name: "brush", value: null }],
        vconcat: [
            {
                params: [
                    {
                        name: "brush",
                        select: {
                            type: "interval",
                            encodings: ["x"],
                        },
                        push: "outer",
                    },
                ],
                data: { values: [{ x: 0 }, { x: 5 }, { x: 10 }] },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { value: 0 },
                },
            },
            {
                data: { values: [{ x: 0 }, { x: 5 }, { x: 10 }] },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: {
                            domain,
                            ...(linkZoom ? { zoom: true } : {}),
                        },
                    },
                    y: { value: 0 },
                },
            },
        ],
    };
}

/**
 * @param {import("../spec/scale.js").Scale["domain"]} domain
 * @param {boolean} [linkZoom]
 */
async function createLinkedHarness(domain, linkZoom = true) {
    const view = await initView(
        createLinkedDomainSpec(domain, linkZoom),
        ConcatView
    );
    const linked = view.children[1];
    const resolution = getRequiredScaleResolution(linked, "x");
    return {
        view,
        linked,
        resolution,
    };
}

describe("Scale resolution selection-linked domains", () => {
    test("selection-linked domains react to pushed outer interval params", async () => {
        const { view, resolution } = await createLinkedHarness({
            param: "brush",
            encoding: "x",
        });

        // Empty brush should fall back to data domain.
        expect(resolution.scale.domain()).toEqual([0, 10]);

        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [2, 4] },
        });

        expect(resolution.scale.domain()).toEqual([2, 4]);

        // Clearing the linked selection should restore the data-derived domain.
        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: null },
        });

        expect(resolution.scale.domain()).toEqual([0, 10]);
    });

    test("selection-linked domains are not restored to previous zoom domains", async () => {
        const { view, resolution } = await createLinkedHarness({
            param: "brush",
            encoding: "x",
        });

        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [2, 4] },
        });
        expect(resolution.scale.domain()).toEqual([2, 4]);

        // Simulate a previously zoomed domain.
        resolution.getScale().domain([2.5, 3.5]);

        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [6, 8] },
        });

        expect(resolution.scale.domain()).toEqual([6, 8]);
    });

    test("selection-linked domains skip zoomTo animation during continuous updates", async () => {
        const { view, linked, resolution } = await createLinkedHarness(
            { param: "brush", encoding: "x" },
            false
        );
        const spy = vi.spyOn(resolution, "zoomTo");

        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [2, 4] },
        });

        // Non-obvious: emulate that the linked view has rendered so animate-path
        // transitions would normally be allowed for continuous scales.
        linked.onBeforeRender();

        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [6, 8] },
        });

        expect(spy).not.toHaveBeenCalled();
        expect(resolution.scale.domain()).toEqual([6, 8]);
        spy.mockRestore();
    });

    test.each([
        {
            name: "two-way linked domains write domain updates back to interval params",
            domain: { param: "brush", encoding: "x", sync: "twoWay" },
            linkZoom: true,
            expected: [2, 4],
        },
        {
            name: "auto sync writes domain updates back when linked scale is zoomable",
            domain: { param: "brush", encoding: "x" },
            linkZoom: true,
            expected: [2, 4],
        },
        {
            name: "auto sync does not write domain updates back when linked scale is not zoomable",
            domain: { param: "brush", encoding: "x" },
            linkZoom: false,
            expected: null,
        },
        {
            name: "one-way linked domains do not write domain updates back to params",
            domain: { param: "brush", encoding: "x", sync: "oneWay" },
            linkZoom: true,
            expected: null,
        },
    ])("$name", async ({ domain, linkZoom, expected }) => {
        const { view, resolution } = await createLinkedHarness(
            domain,
            linkZoom
        );
        resolution.getScale().domain([2, 4]);

        expect(view.paramRuntime.getValue("brush").intervals.x).toEqual(
            expected
        );
    });

    test("two-way linked domains clear interval when domain returns to fallback", async () => {
        const { view, resolution } = await createLinkedHarness({
            param: "brush",
            encoding: "x",
            sync: "twoWay",
        });

        resolution.getScale().domain([2, 4]);
        expect(view.paramRuntime.getValue("brush").intervals.x).toEqual([2, 4]);

        resolution.getScale().domain([0, 10]);
        expect(view.paramRuntime.getValue("brush").intervals.x).toBeNull();
    });

    test("two-way linked domains preserve non-target interval channels", async () => {
        const view = await initView(
            {
                params: [{ name: "brush", value: null }],
                vconcat: [
                    {
                        params: [
                            {
                                name: "brush",
                                select: {
                                    type: "interval",
                                    encodings: ["x", "y"],
                                },
                                push: "outer",
                            },
                        ],
                        data: {
                            values: [
                                { x: 0, y: 0 },
                                { x: 5, y: 1 },
                                { x: 10, y: 2 },
                            ],
                        },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                        },
                    },
                    {
                        data: { values: [{ x: 0 }, { x: 5 }, { x: 10 }] },
                        mark: "point",
                        encoding: {
                            x: {
                                field: "x",
                                type: "quantitative",
                                scale: {
                                    domain: {
                                        param: "brush",
                                        encoding: "x",
                                        sync: "twoWay",
                                    },
                                    zoom: true,
                                },
                            },
                            y: { value: 0 },
                        },
                    },
                ],
            },
            ConcatView
        );

        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [1, 3], y: [0.25, 1.75] },
        });

        const linked = view.children[1];
        const resolution = getRequiredScaleResolution(linked, "x");
        resolution.getScale().domain([6, 8]);

        expect(view.paramRuntime.getValue("brush").intervals).toEqual({
            x: [6, 8],
            y: [0.25, 1.75],
        });
    });

    test("two-way linked domains skip redundant param updates for equal intervals", async () => {
        const { view, resolution } = await createLinkedHarness({
            param: "brush",
            encoding: "x",
            sync: "twoWay",
        });

        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [2, 4] },
        });

        const runtime = view.paramRuntime.findRuntimeForParam("brush");
        const listener = vi.fn();
        const unsubscribe = runtime.subscribe("brush", listener);
        listener.mockClear();

        resolution.getScale().domain([2, 4]);

        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
    });
});
