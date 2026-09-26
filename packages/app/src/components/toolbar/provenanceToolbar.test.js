// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import ProvenanceButtons from "./provenanceToolbar.js";

describe("provenance toolbar menu", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it("exposes the current state and activates a selected history entry", async () => {
        const activateState = vi.fn();
        const element = new ProvenanceButtons();
        element.provenance = /** @type {any} */ ({
            store: { subscribe: () => () => {} },
            isEmpty: () => false,
            isUndoable: () => false,
            isRedoable: () => false,
            getFullActionHistory: () => [
                { type: "sample/__baseline__", provenanceId: 1 },
                { type: "sample/sort", provenanceId: 2 },
            ],
            getActionInfo: () => ({ title: "Sort samples" }),
            getCurrentIndex: () => 1,
            activateState,
        });
        document.body.append(element);
        await element.updateComplete;

        const trigger = /** @type {HTMLButtonElement} */ (
            element.querySelector("button[title='Provenance']")
        );
        trigger.click();
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(
            document.querySelector("[role='menu']")?.getAttribute("aria-label")
        ).toBe("Provenance");
        expect(
            document.querySelector("[aria-current='step']")?.textContent
        ).toContain("Sort samples");

        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        );
        document.activeElement.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        );
        expect(activateState).toHaveBeenCalledWith(2);
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });
});
