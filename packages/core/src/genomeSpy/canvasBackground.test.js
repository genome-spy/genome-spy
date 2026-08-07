import { describe, expect, test } from "vitest";
import {
    getCanvasBackground,
    getExportBackground,
} from "./canvasBackground.js";

describe("canvas background", () => {
    test("prefers the explicit visualization background over its theme", () => {
        expect(
            getCanvasBackground(
                /** @type {import("../spec/root.js").RootSpec} */ ({
                    background: "papayawhip",
                    theme: "dark",
                })
            )
        ).toBe("papayawhip");
    });

    test("uses the last background provided by selected themes", () => {
        expect(
            getCanvasBackground(
                /** @type {import("../spec/root.js").RootSpec} */ ({
                    theme: ["dark", "quartz"],
                })
            )
        ).toBe("#f9f9f9");
    });

    test("uses the visualization background for exports unless overridden", () => {
        const spec = /** @type {import("../spec/root.js").RootSpec} */ ({
            background: "lavender",
        });

        expect(getExportBackground(spec, {})).toBe("lavender");
        expect(getExportBackground(spec, { background: "ivory" })).toBe(
            "ivory"
        );
        expect(getExportBackground(spec, { background: null })).toBeNull();
        expect(
            getExportBackground(
                /** @type {import("../spec/root.js").RootSpec} */ ({}),
                {}
            )
        ).toBe("white");
    });
});
