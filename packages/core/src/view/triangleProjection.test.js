import { expect, test } from "vitest";
import Rectangle from "./layout/rectangle.js";
import { createHeadlessEngine, renderToLayout } from "./testUtils.js";
import UnitView from "./unitView.js";

test("triangle anchors and endpoints stay on the same 45° projection through x zoom", async () => {
    const contact = { chrom: 1, a: 21, b: 40, c: 10 };
    const { view } = await createHeadlessEngine({
        assembly: "hg19",
        projection: "triangle",
        params: [
            { name: "width", value: 600 },
            { name: "height", value: 450 },
        ],
        scales: { x: { type: "locus", domain: [0, 99], zoom: true } },
        data: { values: [contact] },
        encoding: {
            x: { chrom: "chrom", pos: "a", offset: 1, type: "locus" },
            y: { field: "b", type: "locus" },
        },
        layer: [
            {
                mark: "point",
                data: {
                    values: [
                        contact,
                        { ...contact, a: null },
                        { ...contact, a: "21" },
                    ],
                },
            },
            { mark: { type: "text", text: "Contact" } },
            {
                encoding: {
                    x2: { datum: 20 },
                    y2: { field: "c" },
                },
                layer: [{ mark: "rule" }, { mark: "arrow" }, { mark: "link" }],
            },
            {
                projection: null,
                mark: "rect",
                encoding: {
                    x: { value: 0.9 },
                    x2: { value: 1 },
                    y: { value: 0 },
                    y2: { value: 0.1 },
                },
            },
        ],
    });

    try {
        renderToLayout(view, Rectangle.create(0, 0, 200, 100));
        const xScale = view.getScaleResolution("x");
        const yScale = view.getScaleResolution("y");
        expect(xScale.isZoomable()).toBe(true);
        expect(yScale.isZoomable()).toBe(false);
        expect(view.getAxisResolution("y").getAxisProps()).toBeNull();

        // The second endpoint lies below the diagonal. Its height must stay
        // negative so the plot clips the segment instead of folding it.
        const units = view
            .getDescendants()
            .filter((child) => child instanceof UnitView);
        for (const magnification of [1, 2]) {
            for (const unit of units) {
                const { x, y, x2, y2 } = unit.mark.encoders;
                const data = [...unit.getCollector().getData()];
                expect(data).toHaveLength(1);
                const [datum] = data;
                const mark = unit.mark.getType();
                if (mark === "rect") {
                    expect([x(datum), y(datum)]).toEqual([0.9, 0]);
                    continue;
                }
                expect(Number(x(datum)) * unit.coords.width).toBeCloseTo(
                    60 * magnification
                );
                expect(Number(y(datum)) * unit.coords.height).toBeCloseTo(
                    20 * magnification
                );
                if (mark === "rule" || mark === "arrow" || mark === "link") {
                    expect(Number(x2(datum)) * unit.coords.width).toBeCloseTo(
                        30 * magnification
                    );
                    expect(Number(y2(datum)) * unit.coords.height).toBeCloseTo(
                        -10 * magnification
                    );
                }
            }
            if (magnification === 1) await xScale.zoomTo([0, 49], 0);
        }
    } finally {
        view.disposeSubtree();
    }
});

test("a unit triangle view infers its index domain from the displayed midpoint", async () => {
    const { view } = await createHeadlessEngine({
        projection: "triangle",
        data: { values: [{ a: 0, b: 1 }] },
        mark: "point",
        encoding: {
            x: { field: "a", type: "index" },
            y: { field: "b", type: "index" },
        },
    });
    try {
        expect(view.getScaleResolution("x").getDomain()).toEqual([0, 1]);
    } finally {
        view.disposeSubtree();
    }
});

test.each(/** @type {const} */ (["up", "down"]))(
    "displace2d places labels at projected matrix anchors facing %s",
    async (direction) => {
        const { view } = await createHeadlessEngine({
            projection: { type: "triangle", direction },
            width: 100,
            height: 100,
            scales: { x: { domain: [0, 9] } },
            data: { values: [{ column: 0, row: 1 }] },
            encoding: {
                x: { field: "column", type: "index" },
                y: { field: "row", type: "index" },
            },
            layer: [
                {
                    transform: [
                        {
                            type: "displace2d",
                            x: "column",
                            y: "row",
                            width: 10,
                            height: 14,
                            as: ["dx", "dy"],
                        },
                    ],
                    mark: { type: "text", text: "Contact" },
                },
            ],
        });
        try {
            renderToLayout(view, Rectangle.create(0, 0, 100, 100));
            const unit = view
                .getDescendants()
                .find((child) => child instanceof UnitView);
            unit.handleBroadcast({ type: "layoutComputed" });
            await view.paramRuntime.whenPropagated();
            const [before] = unit.getCollector().getData();
            // The projected x is the first band edge, and the y anchor is five
            // pixels from the baseline. The collision rectangle extends past both.
            expect(before.dx).toBeCloseTo(5);
            expect(before.dy).toBeCloseTo(direction === "up" ? -2 : 2);

            await view.getScaleResolution("x").zoomTo([0, 4], false);
            await view.paramRuntime.whenPropagated();
            const [after] = unit.getCollector().getData();
            expect(after.dx).toBeCloseTo(5);
            expect(after.dy).toBeCloseTo(0);
        } finally {
            view.disposeSubtree();
        }
    }
);

test.each(/** @type {const} */ (["rect", "tick"]))(
    "a %s in a triangle view must explicitly opt out of projection",
    async (type) => {
        await expect(
            createHeadlessEngine({
                projection: "triangle",
                layer: [{ mark: type }],
            })
        ).rejects.toThrow(
            `The ${type} mark does not support triangle projection.`
        );
    }
);
