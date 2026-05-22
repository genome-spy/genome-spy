// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import AppUiRegistry from "./appUiRegistry.js";

describe("AppUiRegistry", () => {
    it("does not expose the obsolete docked panel API", () => {
        const registry = new AppUiRegistry();

        expect("registerDockedPanel" in registry).toBe(false);
    });

    it("shows one side panel at a time in the app shell", () => {
        const registry = new AppUiRegistry();
        const appShell = document.createElement("div");
        const firstPanel = document.createElement("section");
        const secondPanel = document.createElement("aside");

        registry.attachAppShell(appShell);

        const firstHandle = registry.registerSidePanel({
            id: "first",
            element: firstPanel,
        });
        const secondHandle = registry.registerSidePanel({
            id: "second",
            element: secondPanel,
        });

        firstHandle.show();

        const sidePanelHost = appShell.querySelector(
            ".genome-spy-side-panel-host"
        );
        expect(sidePanelHost.classList.contains("is-open")).toBe(true);
        expect(sidePanelHost.firstElementChild).toBe(firstPanel);

        secondHandle.show();

        expect(firstPanel.hidden).toBe(true);
        expect(secondPanel.hidden).toBe(false);

        secondHandle.hide();

        expect(sidePanelHost.classList.contains("is-open")).toBe(false);
        expect(secondPanel.parentElement).toBe(sidePanelHost);
    });

    it("snaps measured side panel width to integer pixels", () => {
        const registry = new AppUiRegistry();
        const appShell = document.createElement("div");
        const panel = document.createElement("section");

        registry.attachAppShell(appShell);

        const sidePanelHost = appShell.querySelector(
            ".genome-spy-side-panel-host"
        );
        sidePanelHost.getBoundingClientRect = () =>
            /** @type {DOMRect} */ ({
                width: 361.359375,
                height: 100,
                x: 0,
                y: 0,
                top: 0,
                right: 361.359375,
                bottom: 100,
                left: 0,
                toJSON: () => ({}),
            });

        registry
            .registerSidePanel({
                id: "panel",
                element: panel,
                preferredWidth: "min(36vw, 600px)",
            })
            .show();

        expect(sidePanelHost.style.width).toBe("361px");
    });
});
