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
});

/** @param {string} slot */
function createSlottedChild(slot) {
    const child = document.createElement("div");
    child.slot = slot;
    return child;
}
