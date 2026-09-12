import { afterEach, describe, expect, test, vi } from "vitest";
import { startDocumentDrag } from "./documentDrag.js";

const originalDocument = globalThis.document;

afterEach(() => {
    globalThis.document = originalDocument;
});

function installDocumentStub(/** @type {string[]} */ calls) {
    /** @type {Map<string, EventListener>} */
    const listeners = new Map();
    globalThis.document = /** @type {Document} */ (
        /** @type {any} */ ({
            addEventListener(
                /** @type {string} */ type,
                /** @type {EventListener} */ listener
            ) {
                calls.push("add " + type);
                listeners.set(type, listener);
            },
            removeEventListener(
                /** @type {string} */ type,
                /** @type {EventListener} */ listener
            ) {
                calls.push("remove " + type);
                if (listeners.get(type) === listener) {
                    listeners.delete(type);
                }
            },
        })
    );
    return listeners;
}

describe("startDocumentDrag", () => {
    test("cleans up and resumes hover before applying release effects", () => {
        /** @type {string[]} */
        const calls = [];
        const listeners = installDocumentStub(calls);
        const upEvent = /** @type {MouseEvent} */ ({ type: "mouseup" });
        const cancel = startDocumentDrag({
            onMove: vi.fn(),
            onFinish: () => calls.push("finish"),
            onRelease: () => calls.push("release"),
            hoverContext: {
                suspendHoverTracking: () => calls.push("suspend"),
                resumeHoverTracking: (event) =>
                    calls.push("resume " + event?.type),
            },
        });

        listeners.get("mouseup")?.(upEvent);

        expect(calls).toEqual([
            "suspend",
            "add mousemove",
            "add mouseup",
            "remove mousemove",
            "remove mouseup",
            "finish",
            "resume mouseup",
            "release",
        ]);
        expect(cancel()).toBe(false);
    });

    test("cancellation is idempotent and skips release effects", () => {
        /** @type {string[]} */
        const calls = [];
        const listeners = installDocumentStub(calls);
        const onRelease = vi.fn();
        const resumeHoverTracking = vi.fn();
        const cancel = startDocumentDrag({
            onMove: vi.fn(),
            onRelease,
            hoverContext: {
                suspendHoverTracking: vi.fn(),
                resumeHoverTracking,
            },
        });

        expect(cancel()).toBe(true);
        expect(cancel()).toBe(false);
        expect(listeners.size).toBe(0);
        expect(resumeHoverTracking).toHaveBeenCalledOnce();
        expect(resumeHoverTracking).toHaveBeenCalledWith(undefined);
        expect(onRelease).not.toHaveBeenCalled();
    });
});
