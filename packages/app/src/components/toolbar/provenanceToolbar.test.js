// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import ProvenanceButtons from "./provenanceToolbar.js";
import {
    dismissDropdownMenu,
    isDropdownOpenFor,
} from "../../utils/ui/contextMenu.js";

describe("provenance toolbar menu", () => {
    afterEach(() => {
        dismissDropdownMenu();
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

    it("keeps history open and updates the current state while navigating with toolbar buttons", async () => {
        let currentIndex = 2;
        /** @type {Set<() => void>} */
        const subscribers = new Set();
        const actions = [
            { type: "sample/__baseline__", provenanceId: 1 },
            { type: "sample/sort", provenanceId: 2 },
            { type: "sample/filter", provenanceId: 3 },
            { type: "sample/group", provenanceId: 4 },
        ];
        const element = new ProvenanceButtons();
        element.provenance = /** @type {any} */ ({
            store: {
                subscribe: (/** @type {() => void} */ listener) => {
                    subscribers.add(listener);
                    return () => subscribers.delete(listener);
                },
            },
            isEmpty: () => false,
            isUndoable: () => currentIndex > 0,
            isRedoable: () => currentIndex < actions.length - 1,
            getFullActionHistory: () => actions,
            getActionInfo: (/** @type {{ type: string }} */ action) => ({
                title: action.type,
            }),
            getCurrentIndex: () => currentIndex,
            undo: () => {
                currentIndex--;
                subscribers.forEach((listener) => listener());
            },
            redo: () => {
                currentIndex++;
                subscribers.forEach((listener) => listener());
            },
        });
        document.body.append(element);
        await element.updateComplete;

        const trigger = /** @type {HTMLButtonElement} */ (
            element.querySelector("button[title='Provenance']")
        );
        const undo = /** @type {HTMLButtonElement} */ (
            element.querySelector("button[title='Undo (Z)']")
        );
        const redo = /** @type {HTMLButtonElement} */ (
            element.querySelector("button[title='Redo']")
        );
        trigger.click();

        undo.focus();
        undo.click();
        await element.updateComplete;
        expect(isDropdownOpenFor(trigger)).toBe(true);
        expect(document.activeElement).toBe(undo);
        expect(
            document.querySelector("[aria-current='step']")?.textContent
        ).toContain("sample/sort");

        redo.focus();
        redo.click();
        await element.updateComplete;
        expect(isDropdownOpenFor(trigger)).toBe(true);
        expect(document.activeElement).toBe(redo);
        expect(
            document.querySelector("[aria-current='step']")?.textContent
        ).toContain("sample/filter");

        redo.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        expect(isDropdownOpenFor(trigger)).toBe(false);
        expect(document.activeElement).toBe(trigger);

        trigger.click();
        undo.focus();
        undo.click();
        undo.click();
        await element.updateComplete;
        expect(undo.disabled).toBe(true);
        expect(redo.disabled).toBe(false);
        expect(isDropdownOpenFor(trigger)).toBe(true);
        expect(document.activeElement).toBe(trigger);
        trigger.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        expect(isDropdownOpenFor(trigger)).toBe(false);
    });
});
