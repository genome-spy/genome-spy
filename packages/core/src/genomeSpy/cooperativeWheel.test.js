// @vitest-environment jsdom
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { createAndInitialize, renderToLayout } from "../view/testUtils.js";
import ConcatView from "../view/concatView.js";
import AxisView from "../view/axisView.js";
import Scrollbar from "../view/gridView/scrollbar.js";
import InteractionController from "./interactionController.js";
import {
    createMultiPointSelection,
    isActiveIntervalSelection,
} from "../selection/selection.js";

afterEach(() => vi.restoreAllMocks());

/** @param {Partial<import("../spec/view.js").UnitSpec>} [overrides]
 * @returns {import("../spec/view.js").UnitSpec} */
function unit(overrides = {}) {
    return {
        name: "plot",
        width: 200,
        height: 200,
        data: { values: [{ x: 3 }, { x: 7 }] },
        mark: "point",
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                axis: null,
                scale: { domain: [0, 10], zoom: true },
            },
        },
        ...overrides,
    };
}

/**
 * Exercise native cancellation and real hierarchy consumers together. The
 * headless animator settles zooms immediately unless a test queues frames.
 * @param {import("../spec/root.js").RootSpec} spec
 * @param {"default" | "cooperative"} [wheelBehavior]
 */
async function harness(spec, wheelBehavior = "cooperative") {
    const root = await createAndInitialize(spec, ConcatView);
    renderToLayout(root);
    const canvas = document.createElement("canvas");
    const controller = new InteractionController({
        viewRoot: root,
        canvas,
        animator: root.context.animator,
        wheelBehavior,
        tooltip: /** @type {any} */ ({ clear() {} }),
        emitEvent() {},
        tooltipHandlers: {},
    });
    const cleanup = controller.registerInteractionEvents();
    onTestFinished(() => {
        cleanup();
        root.disposeSubtree();
    });
    const plot = /** @type {import("../view/unitView.js").default} */ (
        root.getDescendants().find((v) => v.name === "plot")
    );
    const coords = plot.coords;
    /** @param {WheelEventInit} init */
    const wheel = (init) => {
        const event = new WheelEvent("wheel", {
            clientX: coords.x + 80,
            clientY: coords.y + 20,
            cancelable: true,
            ...init,
        });
        canvas.dispatchEvent(event);
        return event;
    };
    return { root, plot, controller, canvas, wheel, cleanup };
}

/** @param {import("../utils/animator.js").default} animator */
function queueAnimations(animator) {
    animator.transitionsEnabled = true;
    /** @type {((time: number) => void)[]} */
    const queued = [];
    animator.requestTransition = (callback) => {
        if (!queued.includes(callback)) queued.push(callback);
    };
    animator.cancelTransition = (callback) => {
        const index = queued.indexOf(callback);
        if (index >= 0) queued.splice(index, 1);
    };
    return {
        queued,
        flush() {
            const now = performance.now();
            for (let frame = 1; frame <= 100 && queued.length; frame++) {
                queued.shift()(now + frame * 16);
            }
        },
    };
}

test("cooperative input releases page and horizontal scrolling but retains Ctrl zoom and immediate pan", async () => {
    const { plot, wheel, root } = await harness({ vconcat: [unit()] });
    const resolution = plot.getScaleResolution("x");
    const before = resolution.getDomain().slice();
    for (const deltas of [{ deltaY: -50 }, { deltaX: 40, deltaY: 2 }, {}]) {
        expect(wheel(deltas).defaultPrevented).toBe(false);
        expect(resolution.getDomain()).toEqual(before);
    }
    expect(wheel({ ctrlKey: true, deltaY: -60 }).defaultPrevented).toBe(true);
    expect(resolution.getDomain()).not.toEqual(before);
    const zoomed = resolution.getDomain().slice();
    expect(wheel({ ctrlKey: true, deltaX: -15 }).defaultPrevented).toBe(true);
    expect(resolution.getDomain()).not.toEqual(zoomed);
    expect(root.context.animator.transitions).toHaveLength(0);
});

test("viewport scrolling uses native units directly, clamps one owner, and chains outward at boundaries", async () => {
    const { root, plot, wheel } = await harness({
        vconcat: [
            {
                name: "outer",
                viewportHeight: 100,
                vconcat: [
                    { name: "inner", viewportHeight: 60, vconcat: [unit()] },
                    { ...unit({ name: "footer" }), height: 100 },
                ],
            },
        ],
    });
    const bars = root.getDescendants().filter((v) => v instanceof Scrollbar);
    const inner = bars.find((v) => v.dataParent.name === "inner");
    const outer = bars.find((v) => v.dataParent.name === "outer");
    const domain = plot.getScaleResolution("x").getDomain().slice();
    expect(wheel({ deltaY: 2, deltaMode: 1 }).defaultPrevented).toBe(true);
    expect(inner.viewportOffset).toBe(32);
    expect(outer.viewportOffset).toBe(0);
    expect(wheel({ deltaY: 1, deltaMode: 2 }).defaultPrevented).toBe(true);
    expect(inner.viewportOffset).toBe(92);
    wheel({ deltaY: 10000 });
    const innerEnd = inner.viewportOffset;
    expect(outer.viewportOffset).toBe(0);
    wheel({ deltaY: 10000 });
    expect(inner.viewportOffset).toBe(innerEnd);
    expect(outer.viewportOffset).toBeGreaterThan(0);
    expect(wheel({ deltaY: 10 }).defaultPrevented).toBe(false);
    expect(plot.getScaleResolution("x").getDomain()).toEqual(domain);
    expect(root.context.animator.transitions).toHaveLength(0);
});

test("shared axes and concat gaps retain the same cooperative chart policy", async () => {
    const track = unit({
        height: 50,
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                scale: { domain: [0, 10], zoom: true },
            },
        },
    });
    const { root, plot, wheel } = await harness({
        vconcat: [track, { ...track, name: "second" }],
        resolve: { scale: { x: "shared" }, axis: { x: "shared" } },
    });
    const axis = root
        .getDescendants()
        .find((v) => v instanceof AxisView && v.dataParent === root);
    const second = root.getDescendants().find((v) => v.name === "second");
    const resolution = plot.getScaleResolution("x");
    for (const point of [
        {
            clientX: axis.coords.x + axis.coords.width / 2,
            clientY: axis.coords.y + axis.coords.height / 2,
        },
        {
            clientX: plot.coords.x + 80,
            clientY: (plot.coords.y2 + second.coords.y) / 2,
        },
    ]) {
        const before = resolution.getDomain().slice();
        expect(wheel({ ...point, deltaY: -50 }).defaultPrevented).toBe(false);
        expect(resolution.getDomain()).toEqual(before);
        expect(
            wheel({ ...point, ctrlKey: true, deltaY: -50 }).defaultPrevented
        ).toBe(true);
        expect(resolution.getDomain()).not.toEqual(before);
    }
});

test("facet cells scroll their enclosing viewport before Ctrl chart navigation", async () => {
    const { root, plot, wheel } = await harness({
        vconcat: [
            {
                viewportHeight: 70,
                data: {
                    values: [
                        { g: "A", x: 3 },
                        { g: "B", x: 7 },
                    ],
                },
                facet: { row: { field: "g" } },
                spec: unit({ data: undefined, height: 100 }),
            },
        ],
    });
    const bar = root.getDescendants().find((v) => v instanceof Scrollbar);
    const first = plot.facetCoords.values().next().value;
    const point = { clientX: first.x + 80, clientY: first.y + 20 };
    const resolution = plot.getScaleResolution("x");
    const before = resolution.getDomain().slice();
    expect(wheel({ ...point, deltaY: 20 }).defaultPrevented).toBe(true);
    expect(bar.viewportOffset).toBe(20);
    expect(resolution.getDomain()).toEqual(before);
    expect(
        wheel({ ...point, deltaY: -30, ctrlKey: true }).defaultPrevented
    ).toBe(true);
    expect(resolution.getDomain()).not.toEqual(before);
    expect(bar.viewportOffset).toBe(20);
});

test("Ctrl resizing claims a nonzoomable brush only when its authored filter matches", async () => {
    const { plot, wheel } = await harness({
        vconcat: [
            unit({
                encoding: {
                    x: {
                        field: "x",
                        type: "quantitative",
                        axis: null,
                        scale: { domain: [0, 10] },
                    },
                },
                params: [
                    {
                        name: "brush",
                        value: { x: [2, 8] },
                        select: {
                            type: "interval",
                            encodings: ["x"],
                            zoom: {
                                type: "wheel",
                                filter: "event.ctrlKey && event.altKey",
                            },
                        },
                    },
                ],
            }),
        ],
    });
    const before = structuredClone(plot.paramRuntime.getValue("brush"));
    expect(wheel({ deltaY: -30 }).defaultPrevented).toBe(false);
    expect(wheel({ ctrlKey: true, deltaY: -30 }).defaultPrevented).toBe(false);
    expect(plot.paramRuntime.getValue("brush")).toEqual(before);
    expect(
        wheel({ ctrlKey: true, altKey: true, deltaY: -30 }).defaultPrevented
    ).toBe(true);
    expect(plot.paramRuntime.getValue("brush")).not.toEqual(before);
    expect(plot.getScaleResolution("x").getDomain()).toEqual([0, 10]);
});

test("cooperative input gates point wheel selection while Ctrl preserves filtered observers", async () => {
    const { root, plot, wheel } = await harness({
        vconcat: [
            unit({
                params: [
                    {
                        name: "picked",
                        select: {
                            type: "point",
                            on: { type: "wheel", filter: "event.ctrlKey" },
                        },
                    },
                ],
            }),
        ],
    });
    const datum = Array.from(plot.getCollector().getData())[0];
    root.context.getCurrentHover = () => ({ mark: plot.mark, datum });
    const before = plot.paramRuntime.getValue("picked");
    expect(wheel({ deltaY: -30 }).defaultPrevented).toBe(false);
    expect(plot.paramRuntime.getValue("picked")).toBe(before);
    expect(wheel({ ctrlKey: true, deltaY: -30 }).defaultPrevented).toBe(true);
    expect(plot.paramRuntime.getValue("picked").datum).toBe(datum);
});

test.each(["point", "interval"])(
    "Ctrl wheel clears a nonzoomable %s selection only when its authored filter matches",
    async (type) => {
        /** @type {import("../spec/parameter.js").EventConfig} */
        const clear = { type: "wheel", filter: "event.altKey" };
        /** @type {import("../spec/parameter.js").Parameter} */
        const param =
            type === "point"
                ? { name: "selection", select: { type: "point", clear } }
                : {
                      name: "selection",
                      value: { x: [2, 8] },
                      select: {
                          type: "interval",
                          encodings: ["x"],
                          zoom: false,
                          clear,
                      },
                  };
        const { plot, wheel } = await harness({
            vconcat: [
                unit({
                    encoding: {
                        x: {
                            field: "x",
                            type: "quantitative",
                            axis: null,
                            scale: { domain: [0, 10] },
                        },
                    },
                    params: [param],
                }),
            ],
        });
        if (type === "point") {
            const datum = Array.from(plot.getCollector().getData())[0];
            plot.paramRuntime.setValue(
                "selection",
                createMultiPointSelection([datum])
            );
        }
        const before = plot.paramRuntime.getValue("selection");
        expect(wheel({ deltaY: -30, altKey: true }).defaultPrevented).toBe(
            false
        );
        expect(wheel({ deltaY: -30, ctrlKey: true }).defaultPrevented).toBe(
            false
        );
        if (type === "interval") {
            // Interval clearing is limited to the active brush's bounds.
            expect(
                wheel({
                    clientX: plot.coords.x + 10,
                    deltaY: -30,
                    ctrlKey: true,
                    altKey: true,
                }).defaultPrevented
            ).toBe(false);
        }
        expect(plot.paramRuntime.getValue("selection")).toBe(before);
        expect(
            wheel({ deltaY: -30, ctrlKey: true, altKey: true }).defaultPrevented
        ).toBe(true);
        const cleared = plot.paramRuntime.getValue("selection");
        if (type === "point") {
            expect(cleared.data.size).toBe(0);
        } else {
            expect(isActiveIntervalSelection(cleared)).toBe(false);
        }
        expect(plot.getScaleResolution("x").getDomain()).toEqual([0, 10]);
    }
);

test.each(["page", "veto", "scroll", "dispose"])(
    "%s handoff immediately stops queued zoom and does not replay native subscribers",
    async (handoff) => {
        const { root, plot, wheel, controller, cleanup } = await harness({
            vconcat: [unit({ viewportHeight: 80 })],
        });
        const { queued, flush } = queueAnimations(root.context.animator);
        const native = vi.fn();
        controller.subscribeNativeEvent("wheel", native);
        const event = wheel({ ctrlKey: true, deltaY: -80 });
        expect(native.mock.calls[0][0].sourceEvent).toBe(event);
        expect(event.defaultPrevented).toBe(true);
        expect(queued.length).toBeGreaterThan(0);
        const resolution = plot.getScaleResolution("x");
        const before = resolution.getDomain().slice();
        if (handoff === "veto") {
            controller.subscribeNativeEvent("wheel", (e) =>
                e.preventViewDefault()
            );
            expect(wheel({ ctrlKey: true, deltaY: -80 }).defaultPrevented).toBe(
                false
            );
        } else if (handoff === "dispose") {
            cleanup();
        } else {
            const result = wheel({ deltaY: handoff === "scroll" ? 20 : -20 });
            expect(result.defaultPrevented).toBe(handoff === "scroll");
        }
        flush();
        expect(resolution.getDomain()).toEqual(before);
        expect(native).toHaveBeenCalledTimes(handoff === "dispose" ? 1 : 2);
    }
);

test.each(["page", "scroll", "veto"])(
    "%s handoff stops drag-release pan inertia synchronously",
    async (handoff) => {
        const { root, plot, wheel, canvas, controller } = await harness({
            vconcat: [unit({ viewportHeight: 80 })],
        });
        wheel({ ctrlKey: true, deltaY: -200 });
        const { queued, flush } = queueAnimations(root.context.animator);
        let now = 1000;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        const coords = plot.coords;
        canvas.dispatchEvent(
            new MouseEvent("mousedown", {
                button: 0,
                clientX: coords.x + 100,
                clientY: coords.y + 20,
            })
        );
        // Pass the drag axis-lock threshold before collecting inertia samples.
        for (let i = 1; i <= 9; i++) {
            now += 16;
            document.dispatchEvent(
                new MouseEvent("mousemove", {
                    buttons: 1,
                    clientX: coords.x + 100 - i * 2,
                    clientY: coords.y + 20,
                })
            );
        }
        document.dispatchEvent(new MouseEvent("mouseup"));
        expect(queued.length).toBeGreaterThan(0);
        const before = plot.getScaleResolution("x").getDomain().slice();
        if (handoff === "veto")
            controller.subscribeNativeEvent("wheel", (event) =>
                event.preventViewDefault()
            );
        const event = wheel({ deltaY: handoff === "scroll" ? 20 : -20 });
        expect(event.defaultPrevented).toBe(handoff === "scroll");
        expect(queued).toHaveLength(0);
        flush();
        expect(plot.getScaleResolution("x").getDomain()).toEqual(before);
    }
);

test("default wheel navigation stays available without Ctrl", async () => {
    const { plot, wheel } = await harness({ vconcat: [unit()] }, "default");
    const before = plot.getScaleResolution("x").getDomain().slice();
    expect(wheel({ deltaY: -30 }).defaultPrevented).toBe(true);
    expect(plot.getScaleResolution("x").getDomain()).not.toEqual(before);
});
