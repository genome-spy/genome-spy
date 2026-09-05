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
