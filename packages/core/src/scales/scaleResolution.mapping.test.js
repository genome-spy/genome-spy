import reactivePaddingSpec from "../../../../examples/docs/grammar/scale/reactive-padding.json" with { type: "json" };
import { describe, expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";

/** @returns {import("../spec/view.js").UnitSpec} */
function mappingSpec() {
    return {
        params: [
            { name: "low", value: 0 },
            { name: "high", value: 10 },
            { name: "upper", expr: "high * 2" },
            { name: "mapped", expr: "scale('size', 5)" },
            { name: "inverted", expr: "invert('size', 10)" },
        ],
        data: { values: [{ value: 5 }] },
        mark: "point",
        encoding: {
            size: {
                field: "value",
                type: "quantitative",
                scale: {
                    type: "linear",
                    domain: [0, 10],
                    range: [{ expr: "low" }, { expr: "upper" }],
                },
                legend: null,
            },
        },
    };
}

describe("graph-owned scale mapping", () => {
    test("bandwidth follows range and displayed-domain changes through its native dependency", async () => {
        const { view } = await createHeadlessEngine({
            params: [
                { name: "rangeEnd", value: 1 },
                { name: "band", expr: "bandwidth('xOffset')" },
            ],
            data: { values: [{ category: "a" }, { category: "b" }] },
            mark: "point",
            scales: {
                xOffset: {
                    type: "band",
                    domain: ["a", "b"],
                    padding: 0,
                    range: [0, { expr: "rangeEnd" }],
                },
            },
            encoding: {
                xOffset: { field: "category", type: "nominal", legend: null },
            },
        });
        const resolution = view.getScaleResolution("xOffset");
        expect(view.paramRuntime.getValue("band")).toBe(0.5);
        view.paramRuntime.setValue("rangeEnd", 2);
        expect(view.paramRuntime.getValue("band")).toBe(1);
        resolution.scale.domain(["a", "b", "c", "d"]);
        expect(view.paramRuntime.getValue("band")).toBe(0.5);
        const spec = /** @type {import("../spec/view.js").UnitSpec} */ (
            view.spec
        );
        spec.scales.xOffset.range = [0, { expr: "band" }];
        expect(() => resolution.reconfigure()).toThrow(/dependency cycle/);
        spec.scales.xOffset.range = [0, { expr: "rangeEnd" }];
        view.disposeSubtree();
    });

    test("preserves continuous padding as domain normalization", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ value: 5 }] },
            mark: "point",
            encoding: {
                size: {
                    field: "value",
                    type: "quantitative",
                    scale: {
                        type: "linear",
                        domain: [0, 10],
                        range: [0, 100],
                        padding: 10,
                        zero: false,
                        nice: false,
                    },
                },
            },
        });
        const resolution = view.getScaleResolution("size");
        expect(resolution.getDomain()).toEqual([-1.25, 11.25]);
        resolution.reconfigure();
        expect(resolution.getDomain()).toEqual([-1.25, 11.25]);
        view.disposeSubtree();
    });

    test("all mapping helpers read one settled configuration after nested writes", async () => {
        const { view } = await createHeadlessEngine(mappingSpec());
        const runtime = view.paramRuntime;
        const expression = runtime.createExpression(
            "[low, high, scale('size', 5), invert('size', 10), range('size')]"
        );
        const read = vi.fn(() => expression());
        const observed = runtime.computed(
            "mixed inputs",
            expression.dependencies,
            read
        );
        const resolution = view.getScaleResolution("size");
        const notify = vi.fn();
        resolution.addEventListener("range", notify);
        read.mockClear();

        runtime.runInTransaction(() => {
            runtime.setValue("low", 10);
            runtime.runInTransaction(() => runtime.setValue("high", 20));
        });
        runtime.flushNow();

        expect(read).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(observed.get()).toEqual([10, 20, 25, 0, [10, 40]]);
        expect(runtime.getValue("mapped")).toBe(25);
        expect(runtime.getValue("inverted")).toBe(0);
        view.disposeSubtree();
    });

    test("keeps the native dependency when range bindings are replaced or removed", async () => {
        const { view } = await createHeadlessEngine(mappingSpec());
        const resolution = view.getScaleResolution("size");
        const originalRef = resolution.getMappingRef();
        const specification =
            /** @type {import("../spec/view.js").UnitSpec} */ (view.spec);
        const scale =
            /** @type {import("../spec/channel.js").MarkPropFieldDef} */ (
                specification.encoding.size
            ).scale;

        scale.range = [0, { expr: "high * 3" }];
        resolution.reconfigure();
        expect(resolution.getMappingRef()).toBe(originalRef);
        expect(view.paramRuntime.getValue("mapped")).toBe(15);

        // A write to the old binding must no longer affect the live mapping.
        view.paramRuntime.setValue("low", 8);
        expect(resolution.scale.range()).toEqual([0, 30]);
        delete scale.range;
        resolution.reconfigure();
        expect(resolution.getMappingRef()).toBe(originalRef);
        expect(resolution.scale.range()).toEqual([0, 400]);
        expect(view.paramRuntime.getValue("mapped")).toBe(200);
        view.disposeSubtree();
    });

    test.each(["scale('size', 5)", "invert('size', 5)", "range('size')[1]"])(
        "rejects indirect live mapping feedback through %s",
        async (helper) => {
            const spec = mappingSpec();
            spec.params.push({ name: "feedback", expr: helper });
            const { view } = await createHeadlessEngine(spec);
            const resolution = view.getScaleResolution("size");
            const size =
                /** @type {import("../spec/channel.js").MarkPropFieldDef} */ (
                    spec.encoding.size
                );
            size.scale.range = [0, { expr: "feedback" }];

            expect(() => resolution.reconfigure()).toThrow(/dependency cycle/);
            view.disposeSubtree();
        }
    );

    test("publishes public range commands and resumes expression control on input changes", async () => {
        const { view } = await createHeadlessEngine(mappingSpec());
        const resolution = view.getScaleResolution("size");
        resolution.scale.range([0, 100]);
        expect(view.paramRuntime.getValue("mapped")).toBe(50);
        expect(view.paramRuntime.getValue("inverted")).toBe(1);

        resolution.scale.domain([0, 20]);
        expect(resolution.scale.range()).toEqual([0, 100]);
        expect(view.paramRuntime.getValue("mapped")).toBe(25);
        view.paramRuntime.setValue("high", 20);
        expect(resolution.scale.range()).toEqual([0, 40]);
        expect(view.paramRuntime.getValue("mapped")).toBe(10);
        view.disposeSubtree();
    });
});

test("mapping dependencies survive view-level scale recreation", async () => {
    const { view } = await createHeadlessEngine({
        params: [{ name: "mapped", expr: "scale('size', 5)" }],
        data: { values: [{ value: 5 }] },
        mark: "point",
        scales: { size: { type: "linear", domain: [0, 10], range: [0, 20] } },
        encoding: {
            size: { field: "value", type: "quantitative", legend: null },
        },
    });
    try {
        const resolution = view.getScaleResolution("size");
        const mapping = resolution.getMappingRef();
        const changed = vi.fn();
        resolution.observeMapping(changed);
        const mark = /** @type {import("../view/unitView.js").default} */ (view)
            .mark;
        mark.initializeRenderingRevisions([]);
        const resources = mark.getRenderingRevision("resources");
        const encoded = vi.fn(() => mark.encoders.size({ value: 5 }));
        resolution.addEventListener("range", encoded);

        resolution.scale.range([0, 40]);
        changed.mockClear();
        encoded.mockClear();
        resolution.attachViewLevelScaleProps(view, {
            type: "linear",
            domain: [0, 10],
            range: [0, 100],
        });
        view.paramRuntime.flushNow();

        expect(resolution.getMappingRef()).toBe(mapping);
        expect(view.paramRuntime.getValue("mapped")).toBe(50);
        expect(encoded).toHaveReturnedWith(50);
        expect(changed).toHaveBeenCalled();
        expect(mark.getRenderingRevision("resources")).toBeGreaterThan(
            resources
        );

        changed.mockClear();
        // Equal configuration still replaces a resource that retained consumers read.
        resolution.attachViewLevelScaleProps(
            view,
            resolution.getViewLevelScaleProps().props
        );
        view.paramRuntime.flushNow();
        expect(changed).toHaveBeenCalled();
        resolution.scale.range([0, 200]);
        expect(view.paramRuntime.getValue("mapped")).toBe(100);

        resolution.clearViewLevelScaleProps(view);
        view.paramRuntime.flushNow();
        expect(resolution.getMappingRef()).toBe(mapping);
        expect(view.paramRuntime.getValue("mapped")).toBe(resolution.scale(5));
    } finally {
        view.disposeSubtree();
    }
});

test.each(["band", "index"])(
    "production %s mapping groups range and reactive padding",
    async (type) => {
        const channel = type === "band" ? "xOffset" : "x";
        const { view } = await createHeadlessEngine({
            params: [
                { name: "p", value: 0 },
                { name: "end", value: 100 },
                { name: "bandwidth", expr: `bandwidth('${channel}')` },
            ],
            data: { values: [{ category: type === "band" ? "a" : 0 }] },
            mark: "point",
            scales: {
                [channel]: /** @type {any} */ ({
                    type,
                    domain: type === "band" ? ["a", "b"] : [0, 2],
                    range: [0, { expr: "end" }],
                    // Deliberately reverse property order to verify explicit overrides win.
                    paddingOuter: { expr: `length(domain('${channel}')) / 20` },
                    paddingInner: { expr: "p / 2" },
                    padding: { expr: "p" },
                }),
            },
            encoding: {
                [channel]: {
                    field: "category",
                    type: type === "band" ? "nominal" : "quantitative",
                    legend: null,
                    axis: null,
                },
            },
        });
        try {
            const resolution = view.getScaleResolution(channel);
            const mapping = resolution.getMappingRef();
            const observed = vi.fn(() =>
                view.paramRuntime.getValue("bandwidth")
            );
            resolution.observeMapping(observed);
            view.paramRuntime.runInTransaction(() => {
                view.paramRuntime.setValue("p", 0.4);
                view.paramRuntime.setValue("end", 200);
            });
            view.paramRuntime.flushNow();
            expect(observed).toHaveBeenCalledExactlyOnceWith();
            // Primary positional ranges are normalized; offsets retain authored ranges.
            expect(observed).toHaveReturnedWith(type === "band" ? 80 : 0.4);
            expect(resolution.getMappingRef()).toBe(mapping);
            expect(
                /** @type {import("d3-scale").ScaleBand<any>} */ (
                    resolution.scale
                ).paddingInner()
            ).toBe(0.2);
            expect(
                /** @type {import("d3-scale").ScaleBand<any>} */ (
                    resolution.scale
                ).paddingOuter()
            ).toBe(0.1);

            observed.mockClear();
            view.paramRuntime.setValue("p", 0.4);
            view.paramRuntime.flushNow();
            expect(observed).not.toHaveBeenCalled();

            // This domain-to-padding input remains separate from mapping feedback.
            resolution.scale.domain(
                type === "band" ? ["a", "b", "c", "d"] : [0, 4]
            );
            expect(
                /** @type {import("d3-scale").ScaleBand<any>} */ (
                    resolution.scale
                ).paddingOuter()
            ).toBe(type === "band" ? 0.2 : 0.1);
            const spec = /** @type {import("../spec/view.js").UnitSpec} */ (
                view.spec
            );
            spec.scales[channel].padding = {
                expr: `bandwidth('${channel}')`,
            };
            expect(() => resolution.reconfigure()).toThrow(/dependency cycle/);
            spec.scales[channel].padding = { expr: "p" };
        } finally {
            view.disposeSubtree();
        }
    }
);

test.each(["point", "linear"])(
    "rejects reactive padding on %s scales",
    async (type) => {
        await expect(
            createHeadlessEngine({
                data: { values: [{ x: 1 }] },
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: {
                            type: /** @type {"point" | "linear" | "locus"} */ (
                                type
                            ),
                            padding: { expr: "0.2" },
                        },
                    },
                },
            })
        ).rejects.toThrow("expressions require a band or index scale");
    }
);

test.each(["null", "'0.5'", "1 / 0", "-0.1", "1.1"])(
    "rejects invalid inner padding %s before changing mapping",
    async (expr) => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "gap", value: 0.2 }],
            data: { values: [{ x: 0 }] },
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "index",
                    scale: { paddingInner: { expr: "gap" } },
                },
            },
        });
        try {
            const scale = view.getScaleResolution("x").getScale();
            expect(() =>
                view.paramRuntime.setValue(
                    "gap",
                    view.paramRuntime.createExpression(expr)(null)
                )
            ).toThrow("paddingInner expression must resolve");
            expect(
                /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                    scale
                ).paddingInner()
            ).toBe(0.2);
        } finally {
            view.disposeSubtree();
        }
    }
);

test("sequence example reveals pixel gaps without narrowing resolved bases below one pixel", async () => {
    const { view } = await createHeadlessEngine(
        /** @type {import("../spec/view.js").UnitSpec} */ (reactivePaddingSpec)
    );
    try {
        view.paramRuntime.setValue("width", 700);
        const resolution = view.getScaleResolution("x");
        expect(view.paramRuntime.getValue("gapPx")).toBe(0);
        // Exercise the actual domain-to-padding graph at and between the easing boundaries.
        for (const step of [1, 1.5, 2, 2.5, 3, 10]) {
            await resolution.zoomTo([100, 100 + 700 / step - 1]);
            const gap = view.paramRuntime.getValue("gapPx");
            expect(view.paramRuntime.getValue("stepPx")).toBeCloseTo(step);
            expect(gap).toBeCloseTo(
                step === 1
                    ? 0
                    : step >= 3
                      ? 1
                      : ((step - 1) / 2) ** 2 * (3 - (step - 1))
            );
            const scale =
                /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                    resolution.getScale()
                );
            expect(scale.bandwidth() * 700).toBeCloseTo(step - gap);
            expect(scale.bandwidth() * 700).toBeGreaterThanOrEqual(1 - 1e-10);
        }
    } finally {
        view.disposeSubtree();
    }
});
