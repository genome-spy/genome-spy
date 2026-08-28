import { expect, test, vi } from "vitest";
import { visitArrowHeadPositions } from "./arrow.js";

test("visits one head when repeated-head spacing collapses to zero", () => {
    const visitor = vi.fn();

    visitArrowHeadPositions(
        /** @type {any} */ ({
            stemContainsHead: false,
            repeatSpacing: 0,
            headRepeatFootprint: 0,
            strokeWidth: 0,
            geometryLength: 100,
            tip: { x: 80, y: 50 },
            tangent: { x: 1, y: 0 },
        }),
        visitor
    );

    expect(visitor).toHaveBeenCalledOnce();
    expect(visitor).toHaveBeenCalledWith(80, 50);
});
