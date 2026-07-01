// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import * as debugModules from "@genome-spy/core/debug/index.js";
import { attachInspectorOverlay } from "./index.js";

describe("attachInspectorOverlay", () => {
    test("attaches and disposes a floating inspector panel", async () => {
        const inspector = await attachInspectorOverlay({
            getViewRoot: () => undefined,
            getModules: async () => debugModules,
        });

        expect(document.querySelector(".gs-inspector-overlay")).toBe(
            inspector.element
        );
        expect(inspector.panel.style.display).toBe("block");
        expect(inspector.panel.style.height).toBe("100%");

        inspector.dispose();

        expect(document.querySelector(".gs-inspector-overlay")).toBeNull();
    });
});
