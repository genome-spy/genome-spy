import { describe, expect, test } from "vitest";

import { linearScale, linearScaleDefinition } from "./linear.js";

describe("linearScale", () => {
    test("creates configs that carry an immutable reusable definition", () => {
        const first = linearScale({ domain: [0, 10], range: [20, 200] });
        const second = linearScale({ clamp: true });

        expect(first).toEqual({
            type: "linear",
            definition: linearScaleDefinition,
            domain: [0, 10],
            range: [20, 200],
        });
        expect(second.definition).toBe(first.definition);
        expect(second.clamp).toBe(true);
        expect(Object.isFrozen(linearScaleDefinition)).toBe(true);
    });
});
