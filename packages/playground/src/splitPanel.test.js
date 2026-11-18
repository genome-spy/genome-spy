// @vitest-environment jsdom

import { afterEach, describe, expect, test } from "vitest";
import "./splitPanel.js";

afterEach(() => {
    document.body.replaceChildren();
});

describe("split-panel", () => {
    test("updates its resizable regions when a child is added", async () => {
        const panel = /** @type {import("lit").LitElement} */ (
            document.createElement("split-panel")
        );
        panel.append(createSlottedChild("1"), createSlottedChild("2"));
        document.body.append(panel);

        await panel.updateComplete;
        expect(panel.shadowRoot.querySelectorAll(".resizable")).toHaveLength(2);

        panel.append(createSlottedChild("3"));

        await new Promise((resolve) => setTimeout(resolve, 0));
        await panel.updateComplete;
        expect(panel.shadowRoot.querySelectorAll(".resizable")).toHaveLength(3);
    });

    test("only the captured pointer resizes until capture is lost", async () => {
        const panel = /** @type {import("lit").LitElement} */ (
            document.createElement("split-panel")
        );
        panel.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
        panel.append(createSlottedChild("1"), createSlottedChild("2"));
        document.body.append(panel);
        await panel.updateComplete;

        const handle = /** @type {HTMLElement} */ (
            panel.shadowRoot.querySelector('[role="separator"]')
        );
        const captured = new Set();
        handle.setPointerCapture = (id) => captured.add(id);
        handle.hasPointerCapture = (id) => captured.has(id);
        handle.releasePointerCapture = (id) => captured.delete(id);

        /** @param {string} type @param {number} pointerId @param {number} clientX */
        function pointer(type, pointerId, clientX) {
            handle.dispatchEvent(
                Object.assign(new MouseEvent(type, { clientX }), {
                    isPrimary: true,
                    pointerId,
                    pointerType: "pen",
                })
            );
        }

        pointer("pointerdown", 1, 100);
        expect(handle.hasPointerCapture(1)).toBe(true);
        pointer("pointermove", 1, 130);
        pointer("pointermove", 2, 180);
        await panel.updateComplete;
        expect(handle.getAttribute("aria-valuenow")).toBe("65");

        captured.delete(1);
        pointer("lostpointercapture", 1, 130);
        pointer("pointermove", 1, 180);
        await panel.updateComplete;
        expect(panel.classList.contains("resizing")).toBe(false);
        expect(handle.getAttribute("aria-valuenow")).toBe("65");
    });
});

/** @param {string} slot */
function createSlottedChild(slot) {
    const child = document.createElement("div");
    child.slot = slot;
    return child;
}
