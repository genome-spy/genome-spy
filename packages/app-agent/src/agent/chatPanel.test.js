// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import "./chatPanel.js";
import "./chatStream.js";

const originalScrollTo = HTMLElement.prototype.scrollTo;

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
        configurable: true,
        value: vi.fn(),
    });
});

afterAll(() => {
    if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", {
            configurable: true,
            value: originalScrollTo,
        });
    } else {
        delete HTMLElement.prototype.scrollTo;
    }
});

function createSnapshot(messages) {
    return {
        status: "ready",
        preflightState: "idle",
        messages,
        pendingRequest: null,
        pendingResponsePlaceholder: "",
        queuedMessageCount: 0,
        lastError: "",
        lastResponseDurationMs: null,
        expandedViewNodeKeys: [],
    };
}

function createController(snapshot) {
    return {
        getSnapshot: vi.fn(() => snapshot),
        subscribe: vi.fn(() => () => {}),
        open: vi.fn(async () => {}),
        close: vi.fn(),
        sendMessage: vi.fn(),
        queueMessage: vi.fn(),
        refreshPreflight: vi.fn(),
    };
}

describe("gs-agent-chat-panel", () => {
    it("keeps the transcript pinned only while the user is at the bottom", async () => {
        const panel = document.createElement("gs-agent-chat-panel");
        const controller = createController(
            createSnapshot([{ id: 1, kind: "user", text: "Hello" }])
        );

        panel.controller = controller;
        document.body.append(panel);
        await panel.updateComplete;
        await Promise.resolve();

        const transcript = panel.shadowRoot.querySelector(".transcript");
        const scrollToSpy = /** @type {ReturnType<typeof vi.fn>} */ (
            transcript.scrollTo
        );
        scrollToSpy.mockClear();

        Object.defineProperties(transcript, {
            clientHeight: {
                configurable: true,
                value: 200,
            },
            scrollHeight: {
                configurable: true,
                value: 1000,
            },
            scrollTop: {
                configurable: true,
                value: 800,
                writable: true,
            },
        });

        panel.snapshot = createSnapshot([
            { id: 1, kind: "user", text: "Hello" },
            { id: 2, kind: "assistant", text: "World" },
        ]);
        await panel.updateComplete;
        await Promise.resolve();

        expect(scrollToSpy).toHaveBeenCalledTimes(1);

        transcript.scrollTop = 0;
        transcript.dispatchEvent(new Event("scroll"));
        await panel.updateComplete;
        await Promise.resolve();

        expect(panel.shadowRoot.querySelector(".jump-to-latest")).toBeTruthy();
        expect(
            panel.shadowRoot.querySelector(".header-actions button")
        ).toBeNull();

        panel.snapshot = createSnapshot([
            { id: 1, kind: "user", text: "Hello" },
            { id: 2, kind: "assistant", text: "World" },
            { id: 3, kind: "assistant", text: "More" },
        ]);
        await panel.updateComplete;
        await Promise.resolve();

        expect(scrollToSpy).toHaveBeenCalledTimes(1);

        panel.shadowRoot.querySelector(".jump-to-latest").click();
        await panel.updateComplete;
        await Promise.resolve();

        expect(scrollToSpy).toHaveBeenCalledTimes(2);

        panel.snapshot = createSnapshot([
            { id: 1, kind: "user", text: "Hello" },
            { id: 2, kind: "assistant", text: "World" },
            { id: 3, kind: "assistant", text: "More" },
            { id: 4, kind: "assistant", text: "Latest" },
        ]);
        await panel.updateComplete;
        await Promise.resolve();

        expect(scrollToSpy).toHaveBeenCalledTimes(3);

        panel.remove();
    });
});

describe("gs-chat-stream", () => {
    it("renders an explicit error state and hides finished empty turns", async () => {
        const stream = document.createElement("gs-chat-stream");
        document.body.append(stream);

        stream.streamStatus = "error";
        stream.pendingResponsePlaceholder = "Working...";
        stream.streamDraftText = "";
        stream.streamReasoningText = "";
        await stream.updateComplete;

        expect(
            stream.shadowRoot.querySelector(".streaming-error")
        ).toBeTruthy();

        stream.streamStatus = "final";
        await stream.updateComplete;

        expect(stream.shadowRoot.querySelector("article")).toBeNull();

        stream.remove();
    });
});
