import { describe, expect, test } from "vitest";
import { createEditorState } from "./editorState.js";

describe("createEditorState", () => {
    test("keeps the latest editor text while the editor element is unmounted", () => {
        const state = createEditorState("initial");

        state.syncFromEditor({ value: "edited" });

        expect(state.get()).toBe("edited");
    });

    test("reads from the editor when mounted and state when unmounted", () => {
        const state = createEditorState("stored");

        expect(state.getCurrent({ value: "live" })).toBe("live");
        expect(state.getCurrent(undefined)).toBe("stored");
    });
});
