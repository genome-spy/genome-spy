// @vitest-environment jsdom

import { expect, onTestFinished, test, vi } from "vitest";
import {
    createPointerEvent,
    installPointerCapture,
} from "../../testFixtures/pointerCanvas.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import InteractionController from "../genomeSpy/interactionController.js";
import InteractionDispatcher from "../genomeSpy/interactionDispatcher.js";
import Point from "../view/layout/point.js";
import { renderToLayout } from "../view/testUtils.js";
import { getTopLevelSpecView } from "../view/viewFactory.js";

/**
 * @param {import("../view/view.js").default} view
 * @param {import("../types/viewContext.js").default} context
 */
function registerTouchInteractions(view, context) {
    renderToLayout(view);
    const canvas = document.createElement("canvas");
    installPointerCapture(canvas);
    Object.defineProperties(canvas, {
        clientWidth: { value: view.coords.x2 },
        clientHeight: { value: view.coords.y2 },
    });
    const controller = new InteractionController({
        viewRoot: view,
        canvas,
        animator: context.animator,
        tooltip: /** @type {any} */ ({ clear() {} }),
        emitEvent() {},
        tooltipHandlers: {},
        renderPickingFramebuffer() {},
    });
    const stop = controller.registerInteractionEvents();
    onTestFinished(() => {
        stop();
        view.disposeSubtree();
    });

    /** @param {string} type @param {number} x @param {number} [pointerId] @param {number} [y] */
    return (type, x, pointerId = 1, y = 50) =>
        canvas.dispatchEvent(
            createPointerEvent(type, {
                pointerType: "touch",
                pointerId,
                clientX: x,
                clientY: y,
            })
        );
}

test("touch places a ruler and lets an enabled brush claim a drag before pan", async () => {
    const { view, context } = await createHeadlessEngine(
        {
            width: 100,
            height: 100,
            padding: 0,
            params: [
                { name: "brushMode", value: false },
                { name: "defaultRuler", ruler: { on: "mousedown" } },
                { name: "cursor", ruler: { touchDrag: true } },
                {
                    name: "brush",
                    select: {
                        type: "interval",
                        encodings: ["x"],
                        touchDrag: { expr: "brushMode" },
                    },
                },
            ],
            data: { values: [{ x: 0 }, { x: 100 }] },
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 100], zoom: { extent: "unbounded" } },
                    axis: null,
                },
            },
        },
        { contextOptions: { viewFactoryOptions: { wrapRoot: true } } }
    );
    const touch = registerTouchInteractions(view, context);
    const plot = getTopLevelSpecView(view);
    const runtime = plot.paramRuntime;
    const resolution = plot.getScaleResolution("x");
    const brush = () => runtime.getValue("brush").intervals.x;
    const cursor = () => runtime.getValue("cursor").values.x;
    const committed = vi.fn();
    runtime.getIntervalSelectionState("brush").subscribeCommit(committed);
    touch("pointerdown", 30);
    expect(cursor()).toBeCloseTo(30);
    expect(runtime.getValue("defaultRuler").values.x).toBeNull();
    touch("pointermove", 31);
    touch("pointerup", 31);
    expect(cursor()).toBeCloseTo(31);

    touch("pointerdown", 20);
    touch("pointermove", 40);
    touch("pointerup", 40);
    expect(cursor()).toBeCloseTo(40);
    expect(brush()).toBeNull();

    runtime.setValue("brushMode", true);
    touch("pointerdown", 20);
    expect(cursor()).toBeCloseTo(40);
    expect(brush()).toBeNull();
    touch("pointermove", 60);
    expect(brush()).toEqual([20, 60]);
    expect(cursor()).toBeCloseTo(40);
    expect(committed).not.toHaveBeenCalled();
    touch("pointerup", 60);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(resolution.getDomain()).toEqual([0, 100]);

    touch("pointerdown", 30);
    touch("pointermove", 40);
    expect(brush()).toEqual([30, 70]);
    touch("pointerdown", 65, 2);
    touch("pointermove", 85, 2);
    touch("pointerup", 85, 2);
    touch("pointerup", 40);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(brush()).toEqual([30, 70]);
    expect(resolution.getDomain()[1] - resolution.getDomain()[0]).toBeLessThan(
        100
    );
});

test("plain press rulers track touch by default only where the drag is available", async () => {
    const names = ["fixed", "pannable", "disabled", "filtered", "hover"];
    const { view, context } = await createHeadlessEngine({
        padding: 0,
        data: {
            values: [
                { x: 0, y: 0 },
                { x: 100, y: 100 },
            ],
        },
        resolve: { scale: { x: "independent", y: "independent" } },
        hconcat: names.map((/** @type {string} */ name) => ({
            name,
            width: 100,
            height: 100,
            params: [
                {
                    name: "cursor",
                    ruler: {
                        on:
                            name === "filtered"
                                ? "mousedown[event.shiftKey]"
                                : name === "hover"
                                  ? "mousemove"
                                  : "mousedown",
                        touchDrag: name === "disabled" ? false : undefined,
                    },
                },
                ...(name === "pannable"
                    ? [
                          {
                              name: "brush",
                              select: {
                                  type: /** @type {const} */ ("interval"),
                                  encodings: /** @type {["x"]} */ (["x"]),
                              },
                          },
                      ]
                    : []),
            ],
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    axis: /** @type {null} */ (null),
                    scale: { domain: [0, 100] },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    axis: /** @type {null} */ (null),
                    scale: {
                        domain: [0, 100],
                        zoom:
                            name === "pannable"
                                ? { extent: "unbounded" }
                                : false,
                    },
                },
            },
            layer: [{ mark: "point" }, { mark: "rule" }],
        })),
    });
    const touch = registerTouchInteractions(view, context);

    for (const name of names) {
        const plot = view.getDescendants().find((plot) => plot.name === name);
        const { x, y } = plot.coords;
        touch("pointerdown", x + 20, 1, y + 30);
        const cursor = () => plot.paramRuntime.getValue("cursor").values.x;
        expect(cursor()).toBe(name === "fixed" ? 20 : null);
        touch("pointermove", x + 70, 1, y + 60);
        touch("pointerup", x + 70, 1, y + 60);
        if (name === "fixed") {
            expect(cursor()).toBeCloseTo(70);
        } else {
            expect(cursor()).toBeNull();
        }
        if (name === "pannable") {
            expect(plot.paramRuntime.getValue("brush").intervals.x).toBeNull();
            expect(plot.getScaleResolution("y").getDomain()).not.toEqual([
                0, 100,
            ]);
        }
    }
});

test.each([false, true])(
    "shared rulers retain the new cursor across direct plot handoffs, inherited=%s",
    async (inherited) => {
        /** @type {import("../spec/parameter.js").RulerParameter} */
        const ruler = {
            name: "cursor",
            ruler: { encodings: ["y"], snap: false },
        };
        const { view } = await createHeadlessEngine({
            params: inherited ? [ruler] : [{ name: "cursor" }],
            data: { values: [{ y: 0 }, { y: 100 }] },
            encoding: {
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { domain: [0, 100] },
                    axis: null,
                },
            },
            resolve: { scale: { y: "shared" } },
            spacing: 20,
            hconcat: ["first", "second"].map((name) => ({
                name,
                width: 100,
                height: 100,
                ...(inherited
                    ? {}
                    : {
                          params: [
                              {
                                  ...ruler,
                                  push: /** @type {const} */ ("outer"),
                              },
                          ],
                      }),
                // Parallel layers exercise multiple controllers for each declaration.
                layer: [{ mark: "point" }, { mark: "rule" }],
            })),
        });
        onTestFinished(() => view.disposeSubtree());
        renderToLayout(view);

        const plots = ["first", "second"].map((name) =>
            view.getDescendants().find((child) => child.name === name)
        );
        const dispatcher = new InteractionDispatcher({ viewRoot: view });
        /** @param {number} index @param {number} fraction */
        const move = (index, fraction) => {
            const { x, y, width, height } = plots[index].coords;
            dispatcher.dispatch(
                new Point(x + width / 2, y + height * fraction),
                new MouseEvent("mousemove")
            );
        };
        const coordinate = () => view.paramRuntime.findValue("cursor").values.y;

        move(0, 0.25);
        expect(coordinate()).toBeCloseTo(75);
        // No intermediate gap event: the old plot leaves after the new plot writes.
        move(1, 0.75);
        expect(coordinate()).toBeCloseTo(25);
        move(0, 0.4);
        expect(coordinate()).toBeCloseTo(60);

        if (!inherited) {
            const [first, second] = plots.map((plot) => plot.coords);
            dispatcher.dispatch(
                new Point(
                    (first.x2 + second.x) / 2,
                    first.y + first.height / 2
                ),
                new MouseEvent("mousemove")
            );
            expect(coordinate()).toBeNull();
            move(1, 0.25);
            expect(coordinate()).toBeCloseTo(75);
        }

        dispatcher.handlePointerLeave(new MouseEvent("mouseout"));
        expect(coordinate()).toBeNull();
    }
);
