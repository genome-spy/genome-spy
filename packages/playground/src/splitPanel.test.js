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

    test("keeps the handle aligned with the pointer while resizing", async () => {
        const panel =
            /** @type {import("lit").LitElement & { orientation: string }} */ (
                document.createElement("split-panel")
            );
        panel.orientation = "vertical";
        panel.append(createSlottedChild("1"), createSlottedChild("2"));
        document.body.append(panel);

        await panel.updateComplete;

        const resizables = /** @type {HTMLElement[]} */ (
            Array.from(panel.shadowRoot.querySelectorAll(".resizable"))
        );
        Object.defineProperty(resizables[0], "getBoundingClientRect", {
            value: () => ({ height: 100, width: 100 }),
        });
        Object.defineProperty(resizables[1], "getBoundingClientRect", {
            value: () => ({ height: 200, width: 100 }),
        });

        const handle = panel.shadowRoot.querySelector(".resizable-handle");
        handle.dispatchEvent(new MouseEvent("mousedown", { clientY: 200 }));
        window.dispatchEvent(new MouseEvent("mousemove", { clientY: 220 }));

        expect(resizables[0].style.flex).toBe("0 0 120px");
        expect(resizables[1].style.flex).toBe("0 0 180px");

        window.dispatchEvent(new MouseEvent("mouseup"));
    });
});

/** @param {string} slot */
function createSlottedChild(slot) {
    const child = document.createElement("div");
    child.slot = slot;
    return child;
}
