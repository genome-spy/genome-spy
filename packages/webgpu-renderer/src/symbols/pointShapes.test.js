import { describe, expect, test } from "vitest";

import { BUILTIN_POINT_SHAPES, resolvePointShape } from "./pointShapes.js";
import { buildSparsePathAtlasLayout } from "./sparsePathAtlasLayout.js";

describe("point shapes", () => {
    test("every built-in resolves to a closed atlas path", () => {
        const paths = BUILTIN_POINT_SHAPES.map(resolvePointShape);

        expect(() =>
            buildSparsePathAtlasLayout(paths, { normalizationSpan: 2 })
        ).not.toThrow();
    });

    test("accepts SVG paths and rejects unknown names", () => {
        expect(resolvePointShape("M-1-1H1V1H-1Z")).toBe("M-1-1H1V1H-1Z");
        expect(() => resolvePointShape("squircle")).toThrow(
            "Unknown point shape: squircle"
        );
    });
});
