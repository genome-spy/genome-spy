// @vitest-environment jsdom
import { expect, onTestFinished, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";

test("half-open rectangles keep pixel gaps on resize, hide when exhausted, and recover", async () => {
    const { view } = await createHeadlessEngine({
        data: {
            values: [
                { start: 0, end: 10 },
                { start: 10, end: 20 },
            ],
        },
        scales: {
            x: {
                type: "index",
                domain: [0, 19],
                gapPositions: [10],
                gapWidth: 6,
            },
        },
        mark: { type: "rect", minWidth: 0, clamp: true },
        encoding: {
            x: { field: "start", type: "index", axis: null },
            x2: { field: "end" },
            y: { value: 0 },
            y2: { value: 1 },
            fill: { value: "steelblue" },
        },
    });
    onTestFinished(() => view.disposeSubtree());
    for (const width of [100, 200, 6, 4, 100]) {
        const { svg, warnings } = createSvg({
            viewRoot: view,
            logicalWidth: width,
            logicalHeight: 50,
        });
        const rects = Array.from(
            svg.querySelectorAll('[data-mark-type="rect"] rect')
        );
        expect(rects).toHaveLength(width > 6 ? 2 : 0);
        if (rects.length) {
            const end =
                Number(rects[0].getAttribute("x")) +
                Number(rects[0].getAttribute("width"));
            // Each rect expands by 0.1 px to avoid seams.
            expect(Number(rects[1].getAttribute("x")) - end).toBeCloseTo(5.8);
        }
        expect(warnings).toEqual([]);
    }
});
