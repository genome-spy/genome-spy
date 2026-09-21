import { expect, test, vi } from "vitest";
import { visitArrowHeadPositions } from "./arrow.js";

test("visits one head when repeated-head spacing collapses to zero", () => {
    const visitor = vi.fn();
    const tangent = { x: 1, y: 0 };
    const normal = { x: 0, y: 1 };

    visitArrowHeadPositions(
        /** @type {any} */ ({
            bidirectional: false,
            stemContainsHead: false,
            repeatSpacing: 0,
            headRepeatFootprint: 0,
            strokeWidth: 0,
            geometryLength: 100,
            tip: { x: 80, y: 50 },
            tangent,
            normal,
        }),
        visitor
    );

    expect(visitor).toHaveBeenCalledOnce();
    expect(visitor).toHaveBeenCalledWith(80, 50, tangent, normal);
});

test("visits bidirectional heads with endpoint-specific orientations", () => {
    const visitor = vi.fn();
    const tangent = { x: 1, y: 0 };
    const normal = { x: 0, y: 1 };
    const reverseTangent = { x: -1, y: 0 };
    const reverseNormal = { x: 0, y: -1 };

    visitArrowHeadPositions(
        /** @type {any} */ ({
            bidirectional: true,
            stemContainsHead: false,
            repeatSpacing: Infinity,
            headRepeatFootprint: 10,
            strokeWidth: 0,
            geometryLength: 60,
            tail: { x: 20, y: 50 },
            tip: { x: 80, y: 50 },
            tangent,
            normal,
            reverseTangent,
            reverseNormal,
        }),
        visitor
    );

    expect(visitor.mock.calls).toEqual([
        [20, 50, reverseTangent, reverseNormal],
        [80, 50, tangent, normal],
    ]);
});
