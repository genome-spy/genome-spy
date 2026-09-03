// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachControls } from "@genome-spy/core/controls";
import * as debugModules from "@genome-spy/core/debug/index.js";
import { inspectorButton } from "./index.js";

/** @type {(() => void)[]} */
const disposers = [];
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose());
    document.body.replaceChildren();
});

/** @param {import("./index.d.ts").InspectorButtonOptions} [options] */
function setup(options) {
    const container = document.createElement("div");
    document.body.append(container);
    const debug = {
        getViewRoot: () => undefined,
        getModules: vi.fn(async () => debugModules),
    };
    const onError = vi.fn();
    const controls = attachControls(
        container,
        /** @type {import("@genome-spy/core/types/embedApi.js").EmbedResult} */ (
            /** @type {unknown} */ ({ debug })
        ),
        { controls: [inspectorButton(options)], onError }
    );
    disposers.push(controls.dispose);
    return {
        container,
        debug,
        controls,
        onError,
        button: /** @type {HTMLButtonElement} */ (
            controls.element.shadowRoot.querySelector("button")
        ),
    };
}

describe("inspectorButton", () => {
    it("opens lazily, reuses an open overlay, and reopens after closing", async () => {
        const { container, debug, button, controls } = setup();
        expect(button.getAttribute("aria-label")).toBe("Inspector");
        expect(button.title).toBe("Inspect visualization");
        expect(button.querySelector("svg path").getAttribute("fill")).toBe(
            "currentColor"
        );
        expect(debug.getModules).not.toHaveBeenCalled();
        button.click();
        button.click();
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(debug.getModules).toHaveBeenCalledOnce();
        const overlay = container.querySelector(".gs-inspector-overlay");
        expect(overlay.parentElement).toBe(container);
        expect(overlay.getAttribute("role")).toBe("dialog");
        button.click();
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(
            container.querySelectorAll(".gs-inspector-overlay")
        ).toHaveLength(1);
        expect(debug.getModules).toHaveBeenCalledOnce();
        overlay
            .querySelector("gs-inspector-panel")
            .dispatchEvent(new Event("close"));
        expect(overlay.isConnected).toBe(false);
        expect(controls.element.shadowRoot.activeElement).toBe(button);
        button.click();
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(container.querySelector(".gs-inspector-overlay")).not.toBe(
            overlay
        );
        controls.dispose();
        expect(container.querySelector(".gs-inspector-overlay")).toBeNull();
    });

    it("supports text, title, and panel options with independent embeds", async () => {
        const first = setup({
            text: "Debug",
            title: "Inspect this plot",
            width: "500px",
            activePanel: "dataflow",
        });
        const second = setup();
        expect(first.button.textContent).toBe("Debug");
        expect(first.button.title).toBe("Inspect this plot");
        expect(first.button.querySelector("svg")).toBeNull();
        first.button.click();
        second.button.click();
        await vi.waitFor(() => {
            expect(first.button.disabled).toBe(false);
            expect(second.button.disabled).toBe(false);
        });
        expect(
            /** @type {HTMLElement} */ (
                first.container.querySelector(".gs-inspector-overlay")
            ).style.width
        ).toBe("500px");
        expect(
            /** @type {import("./components/inspectorPanel.js").GsInspectorPanel} */ (
                first.container.querySelector("gs-inspector-panel")
            ).activePanel
        ).toBe("dataflow");
        first.controls.dispose();
        expect(
            second.container.querySelector(".gs-inspector-overlay")
        ).not.toBeNull();
    });

    it("cleans up a pending open without reporting an error after disposal", async () => {
        const { container, debug, button, controls, onError } = setup();
        /** @type {(value: typeof debugModules) => void} */
        let finish;
        debug.getModules.mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            })
        );
        button.click();
        await vi.waitFor(() => expect(debug.getModules).toHaveBeenCalledOnce());
        expect(container.querySelector(".gs-inspector-overlay")).toBeNull();
        controls.dispose();
        expect(container.querySelector(".gs-inspector-overlay")).toBeNull();
        finish(debugModules);
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(container.querySelector(".gs-inspector-overlay")).toBeNull();
        expect(onError).not.toHaveBeenCalled();
    });

    it("cleans up failed opens, reports the error, and permits retry", async () => {
        const { container, debug, button, onError } = setup();
        const error = new Error("Debug helpers unavailable");
        debug.getModules.mockRejectedValueOnce(error);
        button.click();
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
        expect(container.querySelector(".gs-inspector-overlay")).toBeNull();
        expect(button.disabled).toBe(false);
        button.click();
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(container.querySelector(".gs-inspector-overlay")).not.toBeNull();
    });
});
