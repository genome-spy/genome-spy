// @vitest-environment jsdom
import PointerCanvas from "../../../testFixtures/pointerCanvas.js";
import { expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { IntervalSelectionController } from "./intervalSelectionController.js";
import Rectangle from "../layout/rectangle.js";
import Point from "../layout/point.js";

// Exercise real scale inversion, interval normalization, and captured pointer drags.
test("brushes stay defined over gaps and use their visible bounds for translation", async () => {
    const { view, context } = await createHeadlessEngine({
        params: [{ name: "brush", value: { type: "interval", intervals: {} } }],
        data: { values: [{ x: 0 }, { x: 19 }] },
        mark: "point",
        encoding: {
            x: {
                field: "x",
                type: "index",
                axis: null,
                scale: {
                    domain: [0, 19],
                    gapPositions: [10],
                    gapWidth: 6,
                },
            },
        },
    });
    const coords = Rectangle.create(0, 0, 100, 50);
    const listeners = new Map();
    view.addInteractionListener = (type, listener) => {
        listeners.set(type, listener);
    };
    const controller = new IntervalSelectionController(
        {
            view,
            context,
            layoutParent: /** @type {any} */ (view),
            getInteractionCoords: () => coords,
            getProjectionCoords: () => coords,
        },
        "brush",
        { name: "brush", select: { type: "interval" } },
        { type: "interval", encodings: ["x"], on: { type: "mousedown" } },
        view.paramRuntime,
        false
    );
    const canvas = new PointerCanvas();
    const drag = (/** @type {number} */ start, /** @type {number} */ end) => {
        const pointerEvent = canvas.event("pointerdown", {
            clientX: start,
            clientY: 25,
        });
        listeners.get("mousedown")({
            point: new Point(start, 25),
            mouseEvent: pointerEvent,
            proxiedMouseEvent: {},
            stopPropagation: vi.fn(),
        });
        canvas.dispatch("pointermove", { clientX: end, clientY: 25 });
        canvas.dispatch("pointerup", { clientX: end, clientY: 25 });
        return view.paramRuntime.getValue("brush").intervals.x;
    };
    const clear = () => controller.clear();
    try {
        for (const [a, b] of [
            [48, 52],
            [52, 48],
        ]) {
            clear();
            expect(drag(a, b)).toEqual([10, 10]);
            expect(controller.contains(new Point(50, 25))).toBe(false);
        }
        clear();
        expect(drag(20, 50)).toEqual([4, 10]);
        clear();
        expect(drag(50, 20)).toEqual([4, 10]);
        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [0, 10], y: null },
        });
        expect(controller.contains(new Point(45, 25))).toBe(true);
        expect(controller.contains(new Point(50, 25))).toBe(false);
        expect(drag(20, 26)).toEqual([1, 10]);
    } finally {
        controller.dispose();
        view.disposeSubtree();
    }
});
