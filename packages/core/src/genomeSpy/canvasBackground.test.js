import { describe, expect, test, vi } from "vitest";
import {
    getCanvasBackground,
    getExportBackground,
    createCanvasBackgroundReader,
} from "./canvasBackground.js";
import { createHeadlessEngine } from "./headlessBootstrap.js";
import { getTopLevelSpecView } from "../view/viewFactory.js";
import { DEFAULT_THEME_COLORS } from "../config/defaultThemeColors.js";

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
        expect(getExportBackground("lavender", {})).toBe("lavender");
        expect(getExportBackground("lavender", { background: "ivory" })).toBe(
            "ivory"
        );
        expect(
            getExportBackground("lavender", { background: null })
        ).toBeNull();
        expect(getExportBackground(undefined, {})).toBe("white");
    });

    test.each([
        [undefined, "pink"],
        ["genomespy", "pink"],
        ["vegalite", undefined],
        [["genomespy", "vegalite"], undefined],
        [["vegalite", "genomespy"], "pink"],
        ["dark", "#333"],
        ["quartz", "#f9f9f9"],
    ])("keeps the background contract of theme %j", async (theme, expected) => {
        const spec = /** @type {import("../spec/root.js").RootSpec} */ ({
            theme,
            data: { values: [{}] },
            mark: "point",
        });
        const { view } = await createHeadlessEngine(spec);
        try {
            const root = getTopLevelSpecView(view);
            const read = createCanvasBackgroundReader(spec, root);
            root.paramRuntime.setValue("defaultThemeColors", {
                ...DEFAULT_THEME_COLORS,
                background: "pink",
            });
            await root.paramRuntime.whenPropagated();
            expect(read()).toBe(expected);
        } finally {
            view.disposeSubtree();
        }
    });

    test("shares a reactive authored-root background between paint and export", async () => {
        /** @type {import("../spec/root.js").RootSpec} */
        const spec = {
            params: [{ name: "palette", value: { background: "white" } }],
            background: { expr: "palette.background" },
            data: { values: [{}] },
            mark: { type: "text", color: "black", text: "Plot" },
        };
        const { view, context } = await createHeadlessEngine(spec, {
            contextOptions: { viewFactoryOptions: { wrapRoot: true } },
        });
        try {
            const root = getTopLevelSpecView(view);
            const read = createCanvasBackgroundReader(spec, root);
            const requestRender = vi.spyOn(context.animator, "requestRender");
            expect(read()).toBe("white");

            root.paramRuntime.setValue("palette", { background: "#181818" });
            await root.paramRuntime.whenPropagated();
            expect(read()).toBe("#181818");
            expect(getExportBackground(read(), {})).toBe("#181818");
            expect(requestRender).toHaveBeenCalledOnce();

            root.paramRuntime.setValue("palette", { background: null });
            await root.paramRuntime.whenPropagated();
            expect(read()).toBeUndefined();
            expect(getExportBackground(read(), {})).toBe("white");
            expect(
                getExportBackground(read(), { background: null })
            ).toBeNull();
        } finally {
            view.disposeSubtree();
        }
    });
});
