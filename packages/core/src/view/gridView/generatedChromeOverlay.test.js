import { describe, expect, test } from "vitest";
import ContainerView from "../containerView.js";
import LayerView from "../layerView.js";
import { createTestViewContext } from "../testUtils.js";
import { isChromeView } from "../viewSelectors.js";
import {
    createGeneratedChromeOverlay,
    markGeneratedChromeOverlay,
} from "./generatedChromeOverlay.js";

describe("generated chrome overlays", () => {
    test("creates a chrome layer view descriptor", () => {
        const context = createTestViewContext();
        const parent = new ContainerView(
            { layer: [] },
            context,
            null,
            null,
            "parent"
        );

        const overlay = createGeneratedChromeOverlay({
            spec: { name: "overlay", layer: [] },
            context,
            layoutParent: parent,
            dataParent: parent,
            name: "overlay",
            zindex: 7,
        });

        expect(overlay.view).toBeInstanceOf(LayerView);
        expect(isChromeView(overlay.view)).toBe(true);
        expect(overlay.zindex).toBe(7);
    });

    test("marks existing layer views as generated chrome", () => {
        const context = createTestViewContext();
        const parent = new ContainerView(
            { layer: [] },
            context,
            null,
            null,
            "parent"
        );
        const view = new LayerView(
            { name: "overlay", layer: [] },
            context,
            parent,
            parent,
            "overlay"
        );

        markGeneratedChromeOverlay(view);

        expect(isChromeView(view)).toBe(true);
    });
});
