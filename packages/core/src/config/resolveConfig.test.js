import { describe, expect, test } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "./defaultConfig.js";
import {
    resolveBaseConfig,
    resolveImportedSpecConfig,
    resolveViewConfig,
} from "./resolveConfig.js";

describe("resolveConfig", () => {
    test("resolves base config from defaults and theme", () => {
        const base = resolveBaseConfig({
            defaultConfig: INTERNAL_DEFAULT_CONFIG,
            theme: {
                mark: { color: "tomato" },
                point: { size: 200 },
            },
        });

        expect(base.mark.color).toBe("tomato");
        expect(base.point.size).toBe(200);
        expect(base.scale.nominalColorScheme).toBe("tableau10");
    });

    test("resolves hierarchical view config using closest scope", () => {
        const base = resolveBaseConfig({
            defaultConfig: INTERNAL_DEFAULT_CONFIG,
        });
        const parent = resolveViewConfig(base, undefined, {
            mark: { color: "gray" },
            point: { size: 123 },
        });
        const child = resolveViewConfig(base, parent, {
            mark: { color: "orange" },
        });

        expect(child.mark.color).toBe("orange");
        expect(child.point.size).toBe(123);
        expect(child.scale.nominalColorScheme).toBe("tableau10");
    });

    test("imported root config overrides import-site config", () => {
        const merged = resolveImportedSpecConfig(
            {
                mark: { color: "steelblue" },
                point: { opacity: 0.3 },
            },
            {
                mark: { color: "firebrick" },
                point: { size: 80 },
            }
        );

        expect(merged.mark.color).toBe("firebrick");
        expect(merged.point.opacity).toBe(0.3);
        expect(merged.point.size).toBe(80);
    });
});
