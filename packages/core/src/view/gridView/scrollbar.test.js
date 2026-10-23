import { expect, onTestFinished, test, vi } from "vitest";
import Rectangle from "../layout/rectangle.js";
import { createHeadlessEngine, renderToLayout } from "../testUtils.js";
import Scrollbar from "./scrollbar.js";

/** @param {"start" | "end"} [anchor] */
async function initialize(anchor = "start") {
    const { view } = await createHeadlessEngine({
        data: { values: [{}] },
        vconcat: [
            {
                width: 100,
                height: 600,
                viewportHeight: { px: 200, anchor },
                mark: "point",
            },
        ],
    });
    renderToLayout(view, Rectangle.create(0, 0, 400, 400));
    const scrollbar = view
        .getDescendants()
        .find((descendant) => descendant instanceof Scrollbar);
    if (!(scrollbar instanceof Scrollbar)) {
        throw new Error("Expected a scrollbar.");
    }

    // Hold real smoothing callbacks so external synchronization runs between frames.
    const animator = view.context.animator;
    animator.transitionsEnabled = true;
    /** @type {Set<(timestamp: number) => void>} */
    const pending = new Set();
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(animator, "requestTransition").mockImplementation((callback) => {
        pending.add(callback);
    });
    vi.spyOn(animator, "cancelTransition").mockImplementation((callback) => {
        pending.delete(callback);
    });
    onTestFinished(() => {
        vi.restoreAllMocks();
    });

    /** @param {number} timestamp */
    const tick = (timestamp) => {
        const callbacks = Array.from(pending);
        pending.clear();
        for (const callback of callbacks) {
            callback(timestamp);
        }
    };

    return { view, scrollbar, pending, tick };
}

test.each(/** @type {const} */ (["start", "end"]))(
    "%s anchoring preserves a physical thumb target through per-frame synchronization",
    async (anchor) => {
        const { view, scrollbar, pending, tick } = await initialize(anchor);
        onTestFinished(() => view.disposeSubtree());
        scrollbar.interpolateViewportOffset({ x: 100 });

        for (
            let timestamp = 16;
            timestamp <= 800 && pending.size;
            timestamp += 16
        ) {
            tick(timestamp);

            // SampleView publishes LocationManager's physical offset before each render.
            scrollbar.updateScrollbar(
                Rectangle.create(0, 0, 100, 200),
                Rectangle.create(0, 0, 100, 600)
            );
            scrollbar.setViewportOffset(scrollbar.viewportOffset, {
                notify: false,
                syncSmoother: true,
            });
        }

        expect(scrollbar.viewportOffset).toBe(100);
        expect(pending.size).toBe(0);
    }
);

test("subtree disposal cancels pending thumb interpolation", async () => {
    const { view, scrollbar, pending } = await initialize();
    scrollbar.interpolateViewportOffset({ x: 100 });
    const staleFrame = pending.values().next().value;
    if (!staleFrame) {
        throw new Error("Expected a pending interpolation frame.");
    }

    view.disposeSubtree();
    expect(pending.size).toBe(0);

    // A frame already taken out of the animator queue must also remain harmless.
    staleFrame(1000);
    expect(scrollbar.viewportOffset).toBe(0);
});
