import { describe, expect, it, vi } from "vitest";
import {
    createDefaultAppKeyboardShortcuts,
    handleKeyboardShortcuts,
    matchesPlainKeyShortcut,
    setupAppKeyboardShortcuts,
    shouldIgnoreShortcutTarget,
} from "./appKeyboardShortcuts.js";

/**
 * @param {Partial<KeyboardEvent>} [overrides]
 * @returns {KeyboardEvent}
 */
function createKeydownEvent(overrides = {}) {
    return /** @type {KeyboardEvent} */ ({
        code: "KeyZ",
        repeat: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        defaultPrevented: false,
        target: null,
        preventDefault() {
            this.defaultPrevented = true;
        },
        ...overrides,
    });
}

describe("app keyboard shortcuts", () => {
    it("matches plain-key shortcuts without modifiers", () => {
        expect(matchesPlainKeyShortcut(createKeydownEvent(), "KeyZ")).toBe(
            true
        );
        expect(
            matchesPlainKeyShortcut(
                createKeydownEvent({ ctrlKey: true }),
                "KeyZ"
            )
        ).toBe(false);
        expect(
            matchesPlainKeyShortcut(
                createKeydownEvent({ shiftKey: true }),
                "KeyZ"
            )
        ).toBe(false);
        expect(
            matchesPlainKeyShortcut(
                createKeydownEvent({ code: "KeyB" }),
                "KeyZ"
            )
        ).toBe(false);
    });

    it("executes undo for plain Z when provenance is undoable", () => {
        const undo = vi.fn();
        const focusSearchField = vi.fn(() => true);
        const shortcuts = createDefaultAppKeyboardShortcuts({
            provenance: {
                isUndoable: () => true,
                undo,
            },
            focusSearchField,
        });
        const event = createKeydownEvent({ code: "KeyZ" });
        const handled = handleKeyboardShortcuts(event, shortcuts);

        expect(handled).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(undo).toHaveBeenCalledTimes(1);
        expect(focusSearchField).not.toHaveBeenCalled();
    });

    it("focuses search for plain F", () => {
        const undo = vi.fn();
        const focusSearchField = vi.fn(() => true);
        const shortcuts = createDefaultAppKeyboardShortcuts({
            provenance: {
                isUndoable: () => true,
                undo,
            },
            focusSearchField,
        });
        const event = createKeydownEvent({ code: "KeyF" });

        expect(handleKeyboardShortcuts(event, shortcuts)).toBe(true);
        expect(focusSearchField).toHaveBeenCalledTimes(1);
        expect(undo).not.toHaveBeenCalled();
    });

    it("ignores shortcuts on editable targets", () => {
        // This setup mirrors focused form controls without requiring a browser DOM.
        const inputTarget = { tagName: "input" };
        const event = createKeydownEvent({
            target: /** @type {EventTarget} */ (inputTarget),
        });
        const undo = vi.fn();
        const focusSearchField = vi.fn(() => true);
        const shortcuts = createDefaultAppKeyboardShortcuts({
            provenance: {
                isUndoable: () => true,
                undo,
            },
            focusSearchField,
        });

        expect(shouldIgnoreShortcutTarget(event.target)).toBe(true);
        expect(handleKeyboardShortcuts(event, shortcuts)).toBe(false);
        expect(undo).not.toHaveBeenCalled();
        expect(focusSearchField).not.toHaveBeenCalled();
    });

    it("does not consume F if search focus callback declines handling", () => {
        const undo = vi.fn();
        const focusSearchField = vi.fn(() => false);
        const shortcuts = createDefaultAppKeyboardShortcuts({
            provenance: {
                isUndoable: () => true,
                undo,
            },
            focusSearchField,
        });
        const event = createKeydownEvent({ code: "KeyF" });

        expect(handleKeyboardShortcuts(event, shortcuts)).toBe(false);
        expect(event.defaultPrevented).toBe(false);
        expect(focusSearchField).toHaveBeenCalledTimes(1);
        expect(undo).not.toHaveBeenCalled();
    });

    it("wires keydown handler via view context", () => {
        /** @type {(event: KeyboardEvent) => void} */
        let keydownListener;
        const undo = vi.fn();
        const focusSearchField = vi.fn(() => true);
        const addKeyboardListener = vi.fn((type, listener) => {
            if (type == "keydown") {
                keydownListener = listener;
            }
        });

        setupAppKeyboardShortcuts({
            viewRoot: /** @type {any} */ ({
                context: { addKeyboardListener },
            }),
            shortcuts: createDefaultAppKeyboardShortcuts({
                provenance: /** @type {any} */ ({
                    isUndoable: () => true,
                    undo,
                }),
                focusSearchField,
            }),
        });

        keydownListener(createKeydownEvent({ code: "KeyZ" }));
        expect(addKeyboardListener).toHaveBeenCalledWith(
            "keydown",
            expect.any(Function)
        );
        expect(undo).toHaveBeenCalledTimes(1);
        expect(focusSearchField).not.toHaveBeenCalled();
    });
});
