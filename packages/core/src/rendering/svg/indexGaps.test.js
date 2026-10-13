// @vitest-environment jsdom
import { expect, test } from "vitest";
import { createHeadlessEngine } from "../../genomeSpy/headlessBootstrap.js";
import { createSvg } from "./index.js";

test.each(["point", "rect"])(
    "%s marks disappear when gaps exhaust the view and recover on resize",
    async (type) => {
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
            mark: { type: /** @type {"point" | "rect"} */ (type), clamp: true },
            encoding: {
                x: { field: "start", type: "index", axis: null },
                ...(type === "rect" ? { x2: { field: "end" } } : {}),
                y: { value: 0.5 },
                ...(type === "rect" ? { y2: { value: 1 } } : {}),
                fill: { value: "steelblue" },
            },
        });
        try {
            for (const width of [100, 6, 4, 100]) {
                const { svg, warnings } = createSvg({
                    viewRoot: view,
                    logicalWidth: width,
                    logicalHeight: 50,
                    background: null,
                });
                const selector = type === "rect" ? "rect" : "circle";
                expect(
                    svg.querySelectorAll(
                        `[data-mark-type="${type}"] ${selector}`
                    )
                ).toHaveLength(width > 6 ? 2 : 0);
                expect(warnings).toEqual([]);
            }
        } finally {
            view.disposeSubtree();
        }
    }
);

test("half-open rectangles separate at cuts and keep CSS gap widths on resize", async () => {
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
        mark: { type: "rect", minWidth: 0 },
        encoding: {
            x: { field: "start", type: "index", axis: null },
            x2: { field: "end" },
            y: { value: 0 },
            y2: { value: 1 },
            fill: { value: "steelblue" },
        },
    });
    try {
        for (const width of [100, 200]) {
            const { svg, warnings } = createSvg({
                viewRoot: view,
                logicalWidth: width,
                logicalHeight: 50,
                background: null,
            });
            const rects = Array.from(
                svg.querySelectorAll('[data-mark-type="rect"] rect')
            );
            expect(rects).toHaveLength(2);
            const end =
                +rects[0].getAttribute("x") + +rects[0].getAttribute("width");
            const start = +rects[1].getAttribute("x");
            // Default 0.1px seam expansion is applied to each endpoint.
            expect(start - end).toBeCloseTo(5.8);
            expect(warnings).toEqual([]);
        }
    } finally {
        view.disposeSubtree();
    }
});

test.each([
    { start: 10, end: 10, width: 0.2 },
    { start: 10, end: 0, width: 47.2 },
    { start: 0, end: 20, width: 100.2 },
])(
    "explicit interval [$start, $end) has correct boundary geometry",
    async ({ start, end, width }) => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ start, end }] },
            mark: { type: "rect", minWidth: 0 },
            encoding: {
                x: {
                    field: "start",
                    type: "index",
                    axis: null,
                    scale: {
                        domain: [0, 19],
                        gapPositions: [10],
                        gapWidth: 6,
                    },
                },
                x2: { field: "end" },
                y: { value: 0 },
                y2: { value: 1 },
                fill: { value: "steelblue" },
            },
        });
        try {
            const { svg } = createSvg({
                viewRoot: view,
                logicalWidth: 100,
                logicalHeight: 50,
                background: null,
            });
            const rect = svg.querySelector('[data-mark-type="rect"] rect');
            expect(+rect.getAttribute("width")).toBeCloseTo(width);
        } finally {
            view.disposeSubtree();
        }
    }
);
