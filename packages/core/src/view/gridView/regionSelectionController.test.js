import { afterEach, describe, expect, it, vi } from "vitest";
import { createAndInitialize } from "../testUtils.js";
import UnitView from "../unitView.js";
import Rectangle from "../layout/rectangle.js";
import { materializeRegionSelection } from "../../selection/regionSelection.js";
import { RegionSelectionController } from "./regionSelectionController.js";

/** @type {UnitView[]} */
const views = [];

afterEach(() => {
    for (const view of views.splice(0)) view.disposeSubtree();
    vi.unstubAllGlobals();
});

/** @param {boolean} [reverse] */
async function setup(reverse = false) {
    const view = await createAndInitialize(
        {
            name: "points",
            data: {
                values: [
                    { x: 2, y: 2 },
                    { x: 8, y: 8 },
                ],
            },
            transform: [{ type: "identifier" }],
            mark: { type: "point", tooltip: null },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 10], reverse },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { domain: [0, 10] },
                },
            },
        },
        UnitView
    );
    views.push(view);
    // Native document events are independent of view routing and canvas offsets.
    vi.stubGlobal("document", new EventTarget());
    vi.stubGlobal("window", new EventTarget());
    const suspend = vi
        .spyOn(view.context, "suspendHoverTracking")
        .mockImplementation(() => {});
    const resume = vi
        .spyOn(view.context, "resumeHoverTracking")
        .mockImplementation(() => {});
    let bounds = Rectangle.create(20, 30, 100, 100);
    const commit = vi.fn();
    const cancel = vi.fn();
    const trace = vi.fn();
    const controller = new RegionSelectionController(view, {
        getCoords: () => bounds,
        isEnabled: () => true,
        onTrace: trace,
        onCommit: commit,
        onCancel: cancel,
    });

    /** @param {number} x @param {number} y @param {boolean} [shiftKey] */
    function press(x, y, shiftKey = true) {
        const mouse = {
            clientX: x + 200,
            clientY: y + 300,
            button: 0,
            shiftKey,
            preventDefault: vi.fn(),
        };
        const interaction =
            /** @type {import("../../utils/interaction.js").default} */ (
                /** @type {unknown} */ ({
                    type: "mousedown",
                    point: { x, y },
                    mouseEvent: mouse,
                    stopped: false,
                    stopPropagation: () => {
                        interaction.stopped = true;
                    },
                })
            );
        view.handleInteraction(interaction, true);
        return interaction;
    }

    /** @param {string} type @param {number} x @param {number} y */
    function pointer(type, x, y) {
        document.dispatchEvent(
            Object.assign(new Event(type), {
                clientX: x + 200,
                clientY: y + 300,
            })
        );
    }

    return {
        view,
        controller,
        commit,
        cancel,
        trace,
        suspend,
        resume,
        press,
        pointer,
        resize: () => {
            bounds = Rectangle.create(20, 30, 200, 100);
        },
    };
}

describe("region selection gesture", () => {
    it("leaves ordinary panning and out-of-view presses alone", async () => {
        const s = await setup();
        expect(s.press(30, 40, false).stopped).toBe(false);
        expect(s.press(0, 0).stopped).toBe(false);
        expect(s.suspend).not.toHaveBeenCalled();
        expect(s.commit).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        "clamps document-level release and selects point centers with reversed x=%s",
        async (reverse) => {
            const s = await setup(reverse);
            expect(s.press(20, 120).stopped).toBe(true);
            s.pointer("mousemove", 70, 120);
            s.pointer("mousemove", 70, 80);
            s.pointer("mouseup", -500, 80);
            expect(s.commit).toHaveBeenCalledOnce();
            expect(s.cancel).not.toHaveBeenCalled();
            const pending =
                /** @type {Exclude<import("../../types/selectionTypes.js").RegionSelection, { status: "cleared" }>} */ (
                    s.commit.mock.calls[0][0]
                );
            expect(pending.intent.producer).toEqual({
                scope: [],
                view: "points",
            });
            expect(pending.intent.fields).toEqual({ x: "x", y: "y" });
            const expected = [
                [0, 0.1],
                [0.5, 0.1],
                [0.5, 0.5],
                [0, 0.5],
            ];
            expect(pending.intent.polygon).toHaveLength(expected.length);
            pending.intent.polygon.forEach((point, i) => {
                expect(point[0]).toBeCloseTo(expected[i][0]);
                expect(point[1]).toBeCloseTo(expected[i][1]);
            });
            const selected = materializeRegionSelection(
                pending,
                s.view.getCollector().getData()
            );
            expect(
                Array.from(selected.data.values()).map((row) => row.x)
            ).toEqual(reverse ? [] : [2]);
            expect(s.trace).toHaveBeenLastCalledWith([]);
            expect(s.resume).toHaveBeenCalledOnce();
            expect(s.controller.cancel()).toBe(false);
        }
    );

    it.each(["Escape", "blur", "dispose", "view disposal"])(
        "cancels %s without committing and resumes hover",
        async (reason) => {
            const s = await setup();
            s.press(20, 120);
            s.pointer("mousemove", 70, 120);
            s.pointer("mousemove", 70, 80);
            if (reason === "Escape")
                document.dispatchEvent(
                    Object.assign(new Event("keydown"), { key: "Escape" })
                );
            else if (reason === "blur") window.dispatchEvent(new Event("blur"));
            else if (reason === "view disposal") s.view.disposeSubtree();
            else s.controller.dispose();
            s.pointer("mouseup", 20, 80);
            expect(s.commit).not.toHaveBeenCalled();
            expect(s.cancel).toHaveBeenCalledOnce();
            expect(s.trace).toHaveBeenLastCalledWith([]);
            expect(s.resume).toHaveBeenCalledOnce();
            expect(s.controller.cancel()).toBe(false);
            if (reason === "dispose") {
                expect(s.press(20, 120).stopped).toBe(false);
                expect(() =>
                    s.controller.createSelection([
                        [0, 0],
                        [5, 0],
                        [0, 5],
                    ])
                ).toThrow("disposed");
            }
        }
    );

    it.each(["data", "layout", "navigation", "mapping settings"])(
        "does not publish a gesture after %s changes",
        async (change) => {
            const s = await setup();
            s.press(20, 120);
            s.pointer("mousemove", 70, 120);
            s.pointer("mousemove", 70, 80);
            if (change === "data") s.view.getCollector().dataRevision++;
            else if (change === "layout") s.resize();
            else if (change === "navigation")
                s.view.getScaleResolution("x").getScale().domain([0, 20]);
            else {
                const scale =
                    /** @type {import("d3-scale").ScaleContinuousNumeric<number, number>} */ (
                        s.view.getScaleResolution("x").getScale()
                    );
                scale.clamp(true);
            }
            s.pointer("mouseup", 20, 80);
            expect(s.commit).not.toHaveBeenCalled();
            expect(s.cancel).toHaveBeenCalledOnce();
            expect(s.trace).toHaveBeenLastCalledWith([]);
            expect(s.resume).toHaveBeenCalledOnce();
        }
    );

    it("treats a straight drag as cancellation and permits the next gesture", async () => {
        const s = await setup();
        s.press(20, 120);
        s.pointer("mousemove", 50, 120);
        s.pointer("mouseup", 70, 120);
        expect(s.commit).not.toHaveBeenCalled();
        expect(s.cancel).toHaveBeenCalledOnce();
        s.press(20, 120);
        s.pointer("mousemove", 70, 120);
        s.pointer("mousemove", 70, 80);
        s.pointer("mouseup", 20, 80);
        expect(s.commit).toHaveBeenCalledOnce();
    });

    it("a failed preview startup does not capture the gesture or prevent retry", async () => {
        const s = await setup();
        s.controller.host.onStart = () => {
            throw new Error("Unsupported preview");
        };
        expect(() => s.press(20, 120)).toThrow("Unsupported preview");
        expect(s.trace).not.toHaveBeenCalled();
        expect(s.suspend).not.toHaveBeenCalled();
        s.controller.host.onStart = undefined;
        s.press(20, 120);
        s.pointer("mousemove", 70, 120);
        s.pointer("mousemove", 70, 80);
        s.pointer("mouseup", 20, 80);
        expect(s.commit).toHaveBeenCalledOnce();
        expect(s.resume).toHaveBeenCalledOnce();
    });
});
