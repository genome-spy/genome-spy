import { describe, expect, test, vi } from "vitest";
import {
    createHeadlessEngine,
    createHeadlessViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import Animator from "../utils/animator.js";

/** @returns {import("../spec/view.js").LayerSpec} */
function calibratedDomainSpec() {
    return {
        params: [{ name: "cnDomain", expr: "domain('y')" }],
        resolve: { scale: { y: "shared" }, axis: { y: "independent" } },
        data: {
            values: [
                { x: 1, cn: 2, depth: 28.124 },
                { x: 2, cn: 4, depth: 56.148 },
            ],
        },
        layer: [
            {
                name: "primary-cn",
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: {
                        field: "cn",
                        type: "quantitative",
                        scale: { domain: [0, 5] },
                    },
                },
            },
            {
                name: "tracking-depth",
                resolve: { scale: { y: "excluded" } },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: {
                        field: "depth",
                        type: "quantitative",
                        scale: {
                            domain: {
                                expr: "[cnDomain[0] * 14.012 + 0.1, cnDomain[1] * 14.012 + 0.1]",
                            },
                            zero: false,
                            nice: false,
                        },
                        axis: { orient: "right" },
                    },
                },
            },
        ],
    };
}

/** @returns {import("../spec/view.js").UnitSpec} */
function offsetRangeSpec() {
    return {
        params: [
            {
                name: "svFootLength",
                expr: "clamp(7 * 100000000 / span(domain('x')), 1, 7)",
            },
        ],
        data: {
            values: [
                { pos: 100000000, strand: "-" },
                { pos: 150000000, strand: "+" },
            ],
        },
        mark: { type: "rule", y: 0.5, size: 2 },
        encoding: {
            x: {
                field: "pos",
                type: "quantitative",
                scale: { domain: [0, 3000000000], zoom: true },
            },
            x2: { field: "pos" },
            xOffset: {
                field: "strand",
                type: "nominal",
                scale: {
                    type: "ordinal",
                    domain: ["-", "+"],
                    range: [
                        { expr: "svFootLength" },
                        { expr: "-svFootLength" },
                    ],
                },
                legend: null,
            },
        },
    };
}

describe("scale-dependent parameters in scale expressions", () => {
    test.each([false, true])(
        "calibrated excluded domain follows the shared source (reversed layers: %s)",
        async (reverse) => {
            const spec = calibratedDomainSpec();
            if (reverse) {
                spec.layer.reverse();
            }
            const { view } = await createHeadlessEngine(spec);
            const primary = view.getScaleResolution("y");
            const depth = view
                .getDescendants()
                .find((child) => child.name === "tracking-depth")
                .getScaleResolution("y");

            expect(primary.getDomain()).toEqual([0, 5]);
            expect(view.paramRuntime.getValue("cnDomain")).toEqual([0, 5]);
            expect(depth.getDomain()).toEqual([0.1, 70.16]);
            expect(depth.scale.props.domainTransition).toBe(false);

            // Each source update must reach the dependent scale before rendering.
            for (const upper of [4.8, 4.1, 3]) {
                primary.scale.domain([1, upper]);
                expect(depth.getDomain()[0]).toBeCloseTo(14.112);
                expect(depth.getDomain()[1]).toBeCloseTo(upper * 14.012 + 0.1);
            }
            view.disposeSubtree();
        }
    );

    test("ordinal offset range follows a zoom-derived parameter", async () => {
        const { view } = await createHeadlessEngine(offsetRangeSpec());
        const x = view.getScaleResolution("x");
        const offset = view.getScaleResolution("xOffset");
        expect(offset.scale.range()).toEqual([1, -1]);
        await x.zoomTo([0, 200000000], 0);
        expect(offset.scale.range()).toEqual([3.5, -3.5]);
        await x.zoomTo([0, 100000000], 0);
        expect(offset.scale.range()).toEqual([7, -7]);
        view.disposeSubtree();
    });

    test("dependent parameters can be inherited and chained", async () => {
        const spec = calibratedDomainSpec();
        spec.layer[1].params = [
            {
                name: "depthDomain",
                expr: "[cnDomain[0] * 14.012 + 0.1, cnDomain[1] * 14.012 + 0.1]",
            },
        ];
        const depthSpec = /** @type {import("../spec/view.js").UnitSpec} */ (
            spec.layer[1]
        );
        depthSpec.encoding.y = {
            field: "depth",
            type: "quantitative",
            scale: {
                domain: { expr: "depthDomain" },
                zero: false,
                nice: false,
            },
        };
        const { view } = await createHeadlessEngine(spec);
        const child = view
            .getDescendants()
            .find((v) => v.name === "tracking-depth");
        expect(child.getScaleResolution("y").getDomain()).toEqual([0.1, 70.16]);
        view.getScaleResolution("y").scale.domain([0, 3]);
        expect(child.getScaleResolution("y").getDomain()[1]).toBeCloseTo(
            42.136
        );
        view.disposeSubtree();
    });

    test("a pending local declaration shadows an initialized ancestor", async () => {
        const spec = offsetRangeSpec();
        const { view } = await createHeadlessEngine({
            params: [{ name: "svFootLength", value: 99 }],
            vconcat: [spec],
        });
        const child = view.getDescendants().find((v) => v.spec === spec);
        expect(child.getScaleResolution("xOffset").scale.range()).toEqual([
            1, -1,
        ]);
        expect(child.paramRuntime.getValue("svFootLength")).toBe(1);
        view.disposeSubtree();
    });

    test.each([false, true])(
        "parameter-mediated domain cycles fail fast (mutual: %s)",
        async (mutual) => {
            const spec = offsetRangeSpec();
            spec.params = [{ name: "a", expr: "domain('x')" }];
            spec.encoding.x = {
                field: "pos",
                type: "quantitative",
                scale: { domain: { expr: mutual ? "b" : "a" } },
            };
            delete spec.encoding.xOffset;
            if (mutual) {
                spec.params.push({ name: "b", expr: "domain('y')" });
                spec.encoding.y = {
                    field: "pos",
                    type: "quantitative",
                    scale: { domain: { expr: "a" } },
                };
            }
            await expect(createHeadlessEngine(spec)).rejects.toThrow(
                /dependency cycle/
            );
        }
    );

    test("a range can depend on its own scale's domain through a parameter", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "upper", expr: "domain('size')[1]" }],
            data: { values: [{ value: 2 }] },
            mark: "point",
            encoding: {
                size: {
                    field: "value",
                    type: "quantitative",
                    scale: {
                        domain: [0, 5],
                        range: [0, { expr: "upper * 10" }],
                    },
                },
            },
        });
        expect(view.getScaleResolution("size").scale.range()).toEqual([0, 50]);
        view.getScaleResolution("size").scale.domain([0, 3]);
        expect(view.getScaleResolution("size").scale.range()).toEqual([0, 30]);
        view.disposeSubtree();
    });

    test.each([false, true])(
        "self-range dependencies fail fast (parameter: %s)",
        async (parameter) => {
            const spec = offsetRangeSpec();
            spec.params = parameter
                ? [{ name: "svFootLength", expr: "range('xOffset')[0]" }]
                : [];
            if (!parameter) {
                spec.encoding.xOffset = {
                    field: "strand",
                    type: "nominal",
                    scale: {
                        type: "ordinal",
                        domain: ["-", "+"],
                        range: [{ expr: "range('xOffset')[0]" }, 1],
                    },
                    legend: null,
                };
            }
            await expect(createHeadlessEngine(spec)).rejects.toThrow(
                /dependency cycle/
            );
        }
    );

    test("failed subscription setup leaves the scale retryable without duplicate listeners", async () => {
        const { view } = await createHeadlessViewHierarchy({
            params: [
                { name: "lower", value: 0 },
                { name: "upper", value: 5 },
            ],
            mark: "point",
            encoding: {
                y: {
                    field: "value",
                    type: "quantitative",
                    scale: {
                        domain: [{ expr: "lower" }, { expr: "upper" }],
                        zero: false,
                        nice: false,
                    },
                },
            },
        });
        const resolution = view.getScaleResolution("y");
        const createExpression = view.paramRuntime.createExpression.bind(
            view.paramRuntime
        );
        // Inject a subscription failure after another domain subscription has
        // succeeded, without changing evaluation or the scoped parameter refs.
        const spy = vi
            .spyOn(view.paramRuntime, "createExpression")
            .mockImplementation((expr) => {
                const fn = createExpression(expr);
                if (expr === "upper") {
                    fn.subscribe = () => {
                        throw new Error("Subscription setup failed");
                    };
                }
                return fn;
            });
        expect(() => resolution.initializeScale()).toThrow(
            "Subscription setup failed"
        );
        expect(() => resolution.scale).toThrow("before initialization");
        spy.mockRestore();

        resolution.initializeScale();
        expect(resolution.getDomain()).toEqual([0, 5]);
        const listener = vi.fn();
        resolution.addEventListener("domain", listener);
        view.paramRuntime.setValue("lower", 1);
        expect(resolution.getDomain()).toEqual([1, 5]);
        expect(listener).toHaveBeenCalledTimes(1);
        view.disposeSubtree();
    });

    test("initialization supports a dynamically inserted dependent subtree", async () => {
        const { view } = await createHeadlessEngine({ vconcat: [] });
        const child =
            await /** @type {import("../view/concatView.js").default} */ (
                view
            ).addChildSpec(calibratedDomainSpec());
        const depth = child
            .getDescendants()
            .find((v) => v.name === "tracking-depth")
            .getScaleResolution("y");
        expect(depth.getDomain()).toEqual([0.1, 70.16]);
        child.getScaleResolution("y").scale.domain([0, 2]);
        expect(depth.getDomain()[1]).toBeCloseTo(28.124);
        await /** @type {import("../view/concatView.js").default} */ (
            view
        ).removeChildAt(0);
        expect(view.getDescendants()).toEqual([view]);
        view.disposeSubtree();
    });

    test("viewport autoscaling keeps calibrated domains aligned during transition frames", async () => {
        const spec = calibratedDomainSpec();
        const primarySpec = /** @type {import("../spec/view.js").UnitSpec} */ (
            spec.layer[0]
        );
        primarySpec.encoding.y = {
            field: "cn",
            type: "quantitative",
            scale: { domain: { source: "viewport" } },
        };
        const animator = new Animator(() => undefined);
        // Advance real transition callbacks manually, without a browser RAF.
        vi.spyOn(animator, "requestRender").mockImplementation(() => undefined);
        const { view } = await createHeadlessEngine(spec, {
            contextOptions: { animator },
        });
        const primary = view.getScaleResolution("y");
        const depth = view
            .getDescendants()
            .find((v) => v.name === "tracking-depth")
            .getScaleResolution("y");
        expect(primary.getDomain()).toEqual([0, 4]);
        const depthTransition = vi.spyOn(depth, "zoomTo");
        view.getDescendants().forEach((v) => v.onBeforeRender());
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            view.getScaleResolution("x").scale.domain([0, 1.5]);
            await vi.advanceTimersByTimeAsync(150);
            expect(animator.transitions.length).toBeGreaterThan(0);
            const start = performance.now();
            const domains = new Set();
            for (const elapsed of [0, 125, 250, 375, 600]) {
                animator.transitions
                    .splice(0)
                    .forEach((callback) => callback(start + elapsed));
                const domain = primary.getDomain();
                domains.add(domain[1]);
                expect(depth.getDomain()[0]).toBeCloseTo(
                    domain[0] * 14.012 + 0.1
                );
                expect(depth.getDomain()[1]).toBeCloseTo(
                    domain[1] * 14.012 + 0.1
                );
            }
            expect(domains.size).toBeGreaterThan(2);
            expect(primary.getDomain()).toEqual([0, 2]);
            expect(depthTransition).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
            view.disposeSubtree();
        }
    });

    test("invalid live domain bindings do not change other scales during preflight", async () => {
        const { view } = await createHeadlessEngine(calibratedDomainSpec());
        const x = view.getScaleResolution("x");
        const y = view.getScaleResolution("y");
        const before = x.getDomain();
        const listener = vi.fn();
        x.addEventListener("domain", listener);
        await expect(
            /** @type {import("../view/layerView.js").default} */ (
                view
            ).addChildSpec({
                params: [{ name: "childOnly", value: 20 }],
                mark: "point",
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [10, 20] },
                    },
                    y: {
                        field: "cn",
                        type: "quantitative",
                        scale: { domain: { expr: "[0, childOnly]" } },
                    },
                },
            })
        ).rejects.toThrow('Parameter "childOnly" is not visible');
        expect(x.getDomain()).toEqual(before);
        expect(y.getDomain()).toEqual([0, 5]);
        expect(listener).not.toHaveBeenCalled();
        view.disposeSubtree();
    });
});
