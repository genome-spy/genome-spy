// @ts-nocheck

import { describe, expect, test } from "vitest";

import ConcatView from "../view/concatView.js";
import LayerView from "../view/layerView.js";
import Rectangle from "../view/layout/rectangle.js";
import UnitView from "../view/unitView.js";
import { renderToLayout } from "../view/testUtils.js";
import {
    getRequiredScaleResolution,
    initView,
} from "./scaleResolutionTestUtils.js";

function pointValues() {
    return [{ value: 0 }, { value: 1 }];
}

/**
 * @param {string} [field]
 * @param {any} [scale]
 */
function quantitative(field = "value", scale) {
    return {
        field,
        type: "quantitative",
        ...(scale === undefined ? {} : { scale }),
    };
}

/**
 * @param {string} channel
 * @param {{ field?: string, scale?: any, params?: any[], name?: string, encoding?: Record<string, any> }} [options]
 */
function point(channel, options = {}) {
    const { field, scale, params, name, encoding = {} } = options;
    return {
        ...(name === undefined ? {} : { name }),
        ...(params === undefined ? {} : { params }),
        mark: "point",
        encoding: {
            ...encoding,
            [channel]: quantitative(field, scale),
        },
    };
}

/**
 * @param {string} channel
 * @param {any} scale
 * @param {{ ownerParams?: any[], childParams?: any[], secondChildParams?: any[], firstField?: string, secondField?: string, values?: any[] }} [options]
 */
function sharedPointScale(channel, scale, options = {}) {
    const {
        ownerParams,
        childParams,
        secondChildParams,
        firstField,
        secondField,
        values = pointValues(),
    } = options;
    return {
        ...(ownerParams === undefined ? {} : { params: ownerParams }),
        data: { values },
        layer: [
            point(channel, { field: firstField, scale, params: childParams }),
            point(channel, {
                field: secondField,
                params: secondChildParams,
            }),
        ],
    };
}

function rangeExpressionScale() {
    return {
        domain: [0, 1],
        range: [0, { expr: "rangeEnd" }],
    };
}

describe("scale resolution expression scope", () => {
    test("independent scales use the unit scope", async () => {
        const view = await initView(
            {
                params: [{ name: "rangeEnd", value: 10 }],
                data: { values: pointValues() },
                ...point("size", { scale: rangeExpressionScale() }),
            },
            UnitView
        );
        const resolution = getRequiredScaleResolution(view, "size");

        expect(resolution.getScale().range()).toEqual([0, 10]);

        view.paramRuntime.setValue("rangeEnd", 20);
        await view.paramRuntime.whenPropagated();

        expect(resolution.getScale().range()).toEqual([0, 20]);
    });

    test("shared scales use their owner instead of shadowing children", async () => {
        const view = await initView(
            sharedPointScale("size", rangeExpressionScale(), {
                ownerParams: [{ name: "rangeEnd", value: 10 }],
                childParams: [{ name: "rangeEnd", value: 2 }],
                secondChildParams: [{ name: "rangeEnd", value: 3 }],
            }),
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "size");

        expect(resolution.getScale().range()).toEqual([0, 10]);

        view.children[0].paramRuntime.setValue("rangeEnd", 20);
        view.children[1].paramRuntime.setValue("rangeEnd", 30);
        await view.paramRuntime.whenPropagated();

        expect(resolution.getScale().range()).toEqual([0, 10]);
    });

    test("shared scales can use ancestor parameters with owner shadowing", async () => {
        const view = await initView(
            {
                params: [{ name: "rangeEnd", value: 12 }],
                resolve: { scale: { size: "independent" } },
                vconcat: [
                    sharedPointScale("size", rangeExpressionScale(), {
                        ownerParams: [{ name: "rangeEnd", value: 8 }],
                    }),
                    sharedPointScale("size", rangeExpressionScale()),
                ],
            },
            ConcatView
        );

        expect(
            getRequiredScaleResolution(view.children[0], "size")
                .getScale()
                .range()
        ).toEqual([0, 8]);
        expect(
            getRequiredScaleResolution(view.children[1], "size")
                .getScale()
                .range()
        ).toEqual([0, 12]);
    });

    test("child-local parameters cannot control shared ranges", async () => {
        await expect(
            initView(
                sharedPointScale("size", rangeExpressionScale(), {
                    childParams: [{ name: "rangeEnd", value: 10 }],
                }),
                LayerView
            )
        ).rejects.toThrow(
            'Parameter "rangeEnd" is not visible from the shared size scale resolution. ' +
                'Move the parameter to the resolution-owning view and use push: "outer" if a child must update it.'
        );
    });

    test("a child can push updates to a shared range owner", async () => {
        const view = await initView(
            sharedPointScale("size", rangeExpressionScale(), {
                ownerParams: [{ name: "rangeEnd", value: 10 }],
                childParams: [{ name: "rangeEnd", push: "outer" }],
            }),
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "size");

        view.children[0].paramRuntime.setValue("rangeEnd", 20);
        await view.paramRuntime.whenPropagated();

        expect(resolution.getScale().range()).toEqual([0, 20]);
    });

    test("configured domain arrays use the shared owner scope", async () => {
        const view = await initView(
            sharedPointScale(
                "y",
                { domain: [{ expr: "0" }, { expr: "upperBound" }] },
                {
                    ownerParams: [{ name: "upperBound", value: 10 }],
                    childParams: [{ name: "upperBound", value: 2 }],
                    firstField: "a",
                    secondField: "b",
                    values: [],
                }
            ),
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "y");

        expect(resolution.getScale().domain()).toEqual([0, 10]);

        view.paramRuntime.setValue("upperBound", 20);
        await view.paramRuntime.whenPropagated();

        expect(resolution.getScale().domain()).toEqual([0, 20]);
    });

    test("child-local parameters cannot control shared domains", async () => {
        await expect(
            initView(
                sharedPointScale(
                    "y",
                    { domain: [0, { expr: "upperBound" }] },
                    {
                        childParams: [{ name: "upperBound", value: 10 }],
                        firstField: "a",
                        secondField: "b",
                        values: [],
                    }
                ),
                LayerView
            )
        ).rejects.toThrow(
            'Parameter "upperBound" is not visible from the shared y scale resolution. ' +
                'Move the parameter to the resolution-owning view and use push: "outer" if a child must update it.'
        );
    });

    test("dynamic members rebind range expressions without leaking removed listeners", async () => {
        const view = await initView(
            {
                params: [{ name: "rangeEnd", value: 10 }],
                data: { values: pointValues() },
                layer: [point("size", { name: "base" })],
            },
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "size");
        const baselineRange = resolution.getScale().range();

        const inserted = await view.addChildSpec(
            point("size", {
                name: "reactive",
                scale: rangeExpressionScale(),
            })
        );

        expect(inserted.getScaleResolution("size")).toBe(resolution);
        expect(resolution.getScale().range()).toEqual([0, 10]);

        view.paramRuntime.setValue("rangeEnd", 20);
        await view.paramRuntime.whenPropagated();
        expect(resolution.getScale().range()).toEqual([0, 20]);

        await view.removeChildAt(1);
        expect(resolution.getScale().range()).toEqual(baselineRange);

        view.paramRuntime.setValue("rangeEnd", 30);
        await view.paramRuntime.whenPropagated();
        expect(resolution.getScale().range()).toEqual(baselineRange);
    });

    test("failed child-local insertion leaves an initialized resolution unchanged", async () => {
        const view = await initView(
            {
                data: { values: pointValues() },
                layer: [
                    point("size", {
                        name: "base",
                        encoding: { x: quantitative() },
                    }),
                ],
            },
            LayerView
        );
        const resolution = getRequiredScaleResolution(view, "size");
        const xResolution = getRequiredScaleResolution(view, "x");
        const baselineRange = resolution.getScale().range();
        const baselineXDomain = xResolution.getScale().domain();
        let xDomainNotifications = 0;
        xResolution.addEventListener("domain", () => {
            xDomainNotifications++;
        });
        renderToLayout(view);

        await expect(
            view.addChildSpec(
                point("size", {
                    name: "invalid",
                    params: [{ name: "childRangeEnd", value: 10 }],
                    scale: {
                        domain: [0, 1],
                        range: [0, { expr: "childRangeEnd" }],
                    },
                    encoding: {
                        x: quantitative("value", { domain: [10, 20] }),
                    },
                })
            )
        ).rejects.toThrow(
            'Parameter "childRangeEnd" is not visible from the shared size scale resolution.'
        );

        expect(view.children.map((child) => child.name)).toEqual(["base"]);
        expect(resolution.getOrderedMembers()).toHaveLength(1);
        expect(xResolution.getOrderedMembers()).toHaveLength(1);
        expect(resolution.getScale().range()).toEqual(baselineRange);
        expect(xResolution.getScale().domain()).toEqual(baselineXDomain);
        expect(xDomainNotifications).toBe(0);
    });

    test("owner-level sashimi domains react to owner geometry and x domains", async () => {
        const view = await initView(
            {
                scales: { x: { domain: [0, 10] } },
                resolve: {
                    scale: { y: "independent" },
                    axis: { y: "independent" },
                },
                layer: [
                    {
                        data: { values: [{ x: 0, value: 1 }] },
                        ...point("y", {
                            encoding: { x: quantitative("x") },
                        }),
                    },
                    {
                        name: "splice-junctions",
                        scales: {
                            y: {
                                type: "sqrt",
                                domain: {
                                    expr: "[0, span(domain('x')) * height / width * 5]",
                                },
                            },
                        },
                        data: {
                            values: [
                                { start: 0, end: 5, span: 5 },
                                { start: 5, end: 10, span: 5 },
                            ],
                        },
                        layer: [
                            point("y", {
                                field: "span",
                                encoding: { x: quantitative("start") },
                            }),
                            point("y", {
                                field: "span",
                                encoding: { x: quantitative("end") },
                            }),
                        ],
                    },
                ],
            },
            LayerView
        );
        const spliceJunctions = view.children[1];
        const yResolution = getRequiredScaleResolution(spliceJunctions, "y");
        const xResolution = getRequiredScaleResolution(view, "x");

        expect(yResolution.getViewLevelScaleProps()?.view).toBe(
            spliceJunctions
        );

        renderToLayout(view, Rectangle.create(0, 0, 400, 200));
        await view.paramRuntime.whenPropagated();
        const wideDomainMax = yResolution.getScale().domain()[1];

        renderToLayout(view, Rectangle.create(0, 0, 200, 200));
        await view.paramRuntime.whenPropagated();
        const narrowDomainMax = yResolution.getScale().domain()[1];

        expect(narrowDomainMax).toBeGreaterThan(wideDomainMax);

        xResolution.getScale().domain([0, 5]);
        await view.paramRuntime.whenPropagated();

        expect(yResolution.getScale().domain()[1]).toBeCloseTo(
            narrowDomainMax / 2
        );
    });
});
