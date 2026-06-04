// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { html } from "lit";
import { templateResultToString } from "@genome-spy/app/agentShared";
import { formatSet } from "../../../app/src/sampleView/state/actionInfo.js";
import { getAgentState } from "./agentState.js";
import "./chatPanel.js";
import "./chatStream.js";
import { toggleAgentChatPanel } from "./chatPanel.js";

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
        loopRecovery: null,
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
        continueCurrentTurn: vi.fn(),
        stopCurrentTurn: vi.fn(),
    };
}

describe("gs-agent-chat-panel", () => {
    it("registers the chat panel as an app side panel when available", async () => {
        const sidePanelHandle = {
            show: vi.fn(),
            hide: vi.fn(),
            toggle: vi.fn(),
            dispose: vi.fn(),
        };
        const app = {
            ui: {
                registerSidePanel: vi.fn((panel) => {
                    document.body.append(panel.element);
                    return sidePanelHandle;
                }),
            },
        };

        getAgentState(app).agentAdapter = {
            requestAgentTurn: vi.fn(),
            getAgentContext: vi.fn(() => ({})),
            getAgentVolatileContext: vi.fn(() => ({})),
            executeActions: vi.fn(),
        };

        await toggleAgentChatPanel(app);

        expect(app.ui.registerSidePanel).toHaveBeenCalledTimes(1);
        expect(app.ui.registerSidePanel).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "agent-chat",
                element: expect.any(HTMLElement),
            })
        );
        expect(sidePanelHandle.show).toHaveBeenCalledTimes(1);
    });

    it("restores focus to the canvas when the panel is closed", async () => {
        const sidePanelHandle = {
            show: vi.fn(),
            hide: vi.fn(),
            toggle: vi.fn(() => false),
            dispose: vi.fn(),
        };
        const appContainer = document.createElement("div");
        const genomeSpyContainer = document.createElement("div");
        genomeSpyContainer.className = "genome-spy-container";
        const canvas = document.createElement("canvas");
        canvas.setAttribute("tabindex", "-1");
        canvas.focus = vi.fn();
        genomeSpyContainer.append(canvas);
        appContainer.append(genomeSpyContainer);
        const app = {
            appContainer,
            ui: {
                registerSidePanel: vi.fn(() => sidePanelHandle),
            },
        };

        getAgentState(app).agentAdapter = {
            requestAgentTurn: vi.fn(),
            getAgentContext: vi.fn(() => ({})),
            getAgentVolatileContext: vi.fn(() => ({})),
            executeActions: vi.fn(),
        };
        getAgentState(app).agentChatPanelHandle = sidePanelHandle;
        getAgentState(app).agentChatPanelHost = document.createElement("div");

        await toggleAgentChatPanel(app);

        expect(sidePanelHandle.toggle).toHaveBeenCalledTimes(1);
        expect(canvas.focus).toHaveBeenCalledTimes(1);
    });

    it("renders result summary sets as reusable rich content", async () => {
        const content = html`Group by thresholds ${formatSet(["> 0"])} as
        ${formatSet(["Loss", "Gain"])} on stopgain_12q14_3`;
        const text = templateResultToString(content);
        const panel = document.createElement("gs-agent-chat-panel");
        const controller = createController(
            createSnapshot([
                {
                    id: 1,
                    kind: "result",
                    text: "Completed 1 action.",
                    lines: [
                        {
                            content,
                            text,
                        },
                    ],
                },
            ])
        );

        panel.controller = controller;
        document.body.append(panel);
        await panel.updateComplete;
        await Promise.resolve();

        const message = panel.shadowRoot.querySelector("gs-chat-message");
        await message.updateComplete;

        const line = message.shadowRoot.querySelector(".message-lines li");
        expect(line.textContent.replace(/\s+/g, " ").trim()).toBe(
            "Group by thresholds {> 0} as {Loss, Gain} on stopgain_12q14_3"
        );
        expect(
            Array.from(line.querySelectorAll("strong"), (element) =>
                element.textContent?.trim()
            )
        ).toEqual(["> 0", "Loss", "Gain"]);

        panel.remove();
    });

    it("sends with Enter and shows a contextual send button only for a draft", async () => {
        const panel = document.createElement("gs-agent-chat-panel");
        const controller = createController(createSnapshot([]));

        panel.controller = controller;
        document.body.append(panel);
        await panel.updateComplete;
        await Promise.resolve();

        const composer = panel.shadowRoot.querySelector(".composer");
        const textarea = composer.querySelector("textarea");
        const initialSendButton = composer.querySelector(
            "button[type='submit']"
        );

        expect(initialSendButton?.classList.contains("is-hidden")).toBe(true);
        expect(initialSendButton?.disabled).toBe(true);

        textarea.value = "Summarize this view";
        textarea.dispatchEvent(new Event("input"));
        await panel.updateComplete;

        const sendButton = composer.querySelector("button[type='submit']");
        expect(sendButton?.getAttribute("aria-label")).toBe("Send");
        expect(sendButton?.classList.contains("is-hidden")).toBe(false);
        expect(sendButton?.disabled).toBe(false);

        textarea.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
            })
        );
        await panel.updateComplete;

        expect(controller.sendMessage).toHaveBeenCalledWith(
            "Summarize this view"
        );

        panel.remove();
    });

    it("renders agent loop recovery controls", async () => {
        const panel = document.createElement("gs-agent-chat-panel");
        const snapshot = {
            ...createSnapshot([{ id: 1, kind: "user", text: "Do the thing" }]),
            status: "awaiting_user_decision",
            pendingRequest: {
                message: "Do the thing",
            },
            loopRecovery: {
                message:
                    "The agent produced too many rejected tool calls without converging.",
            },
        };
        const controller = createController(snapshot);

        panel.controller = controller;
        document.body.append(panel);
        await panel.updateComplete;

        const transcriptRecovery = panel.shadowRoot.querySelector(
            ".transcript .loop-recovery"
        );
        const recovery = panel.shadowRoot.querySelector(
            ".composer .loop-recovery"
        );
        const textarea = panel.shadowRoot.querySelector(".composer textarea");

        expect(transcriptRecovery).toBeNull();
        expect(recovery).toBeTruthy();
        expect(textarea).toBeNull();
        expect(recovery.textContent).toContain("The agent appears to be stuck");
        expect(recovery.textContent).toContain(
            "The agent produced too many rejected tool calls without converging."
        );

        const buttons = Array.from(recovery.querySelectorAll("button"));
        buttons
            .find((button) => button.textContent.trim() === "Continue")
            .click();
        buttons.find((button) => button.textContent.trim() === "Stop").click();

        expect(controller.continueCurrentTurn).toHaveBeenCalledTimes(1);
        expect(controller.stopCurrentTurn).toHaveBeenCalledTimes(1);

        panel.remove();
    });

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
