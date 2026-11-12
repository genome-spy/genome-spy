import { expect, test, vi } from "vitest";
import PointerCanvas from "../../testFixtures/pointerCanvas.js";
import { startPointerDrag } from "./pointerDrag.js";

test("keeps capture outside the canvas until release and ignores other pointers", () => {
    const canvas = new PointerCanvas();
    /** @type {string[]} */
    const calls = [];
    canvas.addEventListener("pointerup", () => calls.push("route"));
    const cancel = startPointerDrag(canvas.event("pointerdown"), {
        onMove: (event) => calls.push("move " + event.clientX),
        onFinish: (released) => {
            expect(canvas.hasPointerCapture(1)).toBe(false);
            calls.push("finish " + released);
        },
        onRelease: () => calls.push("release"),
        hoverContext: {
            suspendHoverTracking: () => calls.push("suspend"),
            resumeHoverTracking: (event) => calls.push("resume " + event.type),
        },
    });

    expect(canvas.hasPointerCapture(1)).toBe(true);
    canvas.dispatch("pointermove", { pointerId: 2 });
    canvas.dispatch("pointermove", { clientX: -20 });
    canvas.dispatch("pointerup", { clientX: -20 });
    canvas.dispatch("pointermove");

    expect(calls).toEqual([
        "suspend",
        "move -20",
        "route",
        "finish true",
        "resume pointerup",
        "release",
    ]);
    expect(cancel()).toBe(false);
});

test.each(["pointercancel", "lostpointercapture"])(
    "%s ends the drag without release effects",
    (type) => {
        const canvas = new PointerCanvas();
        const onFinish = vi.fn();
        const onRelease = vi.fn();
        const resumeHoverTracking = vi.fn();
        const cancel = startPointerDrag(canvas.event("pointerdown"), {
            onMove: vi.fn(),
            onFinish,
            onRelease,
            hoverContext: {
                suspendHoverTracking: vi.fn(),
                resumeHoverTracking,
            },
        });

        canvas.dispatch(type, { pointerId: 2 });
        expect(canvas.hasPointerCapture(1)).toBe(true);
        canvas.dispatch(type);
        canvas.dispatch("pointerup");

        expect(canvas.hasPointerCapture(1)).toBe(false);
        expect(cancel()).toBe(false);
        expect(onFinish).toHaveBeenCalledExactlyOnceWith(false);
        expect(resumeHoverTracking).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(onRelease).not.toHaveBeenCalled();
    }
);

test("releasing the primary button ends a drag while another button remains down", () => {
    const canvas = new PointerCanvas();
    const onMove = vi.fn();
    const onRelease = vi.fn();
    startPointerDrag(canvas.event("pointerdown"), { onMove, onRelease });

    const release = canvas.event("pointermove", { button: 0, buttons: 2 });
    canvas.dispatchEvent(release);
    canvas.dispatch("pointerup");

    expect(onMove).not.toHaveBeenCalled();
    expect(onRelease).toHaveBeenCalledExactlyOnceWith(release);
    expect(canvas.hasPointerCapture(1)).toBe(false);
});
