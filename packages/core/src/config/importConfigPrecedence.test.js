import { describe, expect, test } from "vitest";
import { resolveImportedSpecConfig } from "./resolveConfig.js";

describe("import config precedence", () => {
    test("imported root config overrides import-site config", () => {
        const merged = resolveImportedSpecConfig(
            {
                mark: { color: "steelblue" },
                point: { size: 20 },
            },
            {
                mark: { color: "tomato" },
            }
        );

        expect(merged.mark.color).toBe("tomato");
        expect(merged.point.size).toBe(20);
    });
});
