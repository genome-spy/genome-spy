import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faChevronDown,
    faPaperPlane,
    faRobot,
    faStop,
} from "@fortawesome/free-solid-svg-icons";
import { css, html, LitElement, nothing } from "lit";
import { faStyles, formStyles } from "@genome-spy/app/agentShared";
import { createAgentSessionController } from "./agentSessionController.js";
import { getAgentState } from "./agentState.js";
import { repeat } from "lit/directives/repeat.js";
import "./chatMessage.js";
import "./chatStream.js";
/**
 * @typedef {{
 *     status:
 *         | "ready"
 *         | "preflighting"
 *         | "thinking"
 *         | "executing"
 *         | "unavailable"
 *         | "error";
 *     preflightState: "idle" | "running" | "ready" | "failed";
 *     messages: Array<import("./chatMessage.js").ChatMessage>;
 *     pendingRequest: { message: string } | null;
 *     pendingResponsePlaceholder: string;
 *     queuedMessageCount: number;
 *     lastError: string;
 *     lastResponseDurationMs: number | null;
 *     expandedViewNodeKeys: string[];
 * }} ChatSessionSnapshot
 *
 * @typedef {{
 *     turnId: number;
 *     status: "working" | "streaming" | "final" | "error";
 *     placeholder: string;
 *     draftText: string;
 *     reasoningText: string;
 *     heartbeatTick: number;
 * }} AgentActiveTurnSnapshot
 *
 * @typedef {{
 *     toolCallId: string;
 *     text: string | null;
 *     rejected: boolean;
 * }} ToolExecutionResult
 *
 * @typedef {{
 *     getSnapshot(): ChatSessionSnapshot;
 *     subscribe(listener: (snapshot: ChatSessionSnapshot) => void): () => void;
 *     subscribeToActiveTurn?(
 *         listener: (snapshot: AgentActiveTurnSnapshot | null) => void
 *     ): () => void;
 *     open(): Promise<void>;
 *     close(): void;
 *     sendMessage(message: string): Promise<void>;
 *     queueMessage(message: string): Promise<void>;
 *     refreshPreflight(): Promise<void>;
 *     expandViewNode?(selector: any): void;
 *     collapseViewNode?(selector: any): void;
 *     stopCurrentTurn?(): void;
 *     executeToolCalls?(
 *         toolCalls: import("./types.d.ts").AgentToolCall[]
 *     ): Promise<ToolExecutionResult[]>;
 * }} AgentChatController
 */
/** @type {ChatSessionSnapshot} */
const EMPTY_SNAPSHOT = {
    status: "ready",
    preflightState: "idle",
    messages: [],
    pendingRequest: null,
    pendingResponsePlaceholder: "",
    queuedMessageCount: 0,
    lastError: "",
    lastResponseDurationMs: null,
    expandedViewNodeKeys: [],
};

export default class AgentChatPanel extends LitElement {
    static properties = {
        controller: { attribute: false },
        panelTitle: { type: String },
        snapshot: { state: true },
        draft: { state: true },
        expandedToolResultKeys: { state: true },
        streamTurnId: { state: true },
        streamStatus: { state: true },
        streamDraftText: { state: true },
        streamReasoningText: { state: true },
        streamHeartbeatTick: { state: true },
        devMode: { type: Boolean },
    };

    static styles = [
        formStyles,
        faStyles,
        css`
            :host {
                display: block;
                box-sizing: border-box;
                height: 100%;
                color: #222;
                font-family: var(--gs-font-family, sans-serif);
            }

            .panel {
                display: flex;
                flex-direction: column;
                height: 100%;
            }

            header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--gs-basic-spacing, 10px);
                padding: var(--gs-basic-spacing, 10px);
                border-bottom: 1px solid var(--gs-dialog-stroke-color, #d0d0d0);
            }

            .header-main {
                display: grid;
                gap: 2px;
                min-width: 0;
            }

            .title-row {
                display: flex;
                align-items: center;
                gap: 0.45rem;
                min-width: 0;
                font-weight: bold;
            }

            .title-row svg {
                width: 1em;
                height: 1em;
                flex: 0 0 auto;
                color: var(--gs-theme-primary, #6c82ab);
            }

            .title {
                color: #222;
                font-size: 1rem;
                font-weight: 700;
            }

            .status {
                color: #666;
                font-size: 0.85rem;
            }

            .header-actions {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                flex: 0 0 auto;
            }

            .header-actions .btn {
                padding: 4px 12px;
            }

            .transcript-shell {
                position: relative;
                display: flex;
                flex: 1 1 auto;
                min-height: 0;
            }

            .body {
                display: flex;
                flex-direction: column;
                min-height: 0;
                flex: 1 1 auto;
            }

            .transcript-shell {
                --fade-size: var(--gs-basic-spacing, 10px);

                mask-image: linear-gradient(
                    to bottom,
                    black 0,
                    black calc(100% - var(--fade-size)),
                    transparent 100%
                );
            }

            .transcript {
                display: flex;
                flex-direction: column;
                flex: 1 1 auto;
                gap: 0.65rem;
                min-height: 0;
                overflow: auto;
                padding: var(--gs-basic-spacing, 10px);
                padding-bottom: 0;
            }

            .jump-to-latest {
                position: absolute;
                right: var(--gs-basic-spacing, 10px);
                bottom: var(--gs-basic-spacing, 10px);
                z-index: 1;
                display: inline-flex;
                align-items: center;
                gap: 0.4rem;
                padding: 6px 14px;
                border: 1px solid
                    color-mix(
                        in oklab,
                        var(--gs-theme-primary, #6c82ab) 45%,
                        white
                    );
                border-radius: var(--form-control-border-radius);
                background: color-mix(
                    in oklab,
                    var(--gs-theme-primary, #6c82ab) 10%,
                    white
                );
                color: color-mix(
                    in oklab,
                    var(--gs-theme-primary, #6c82ab) 80%,
                    black
                );
                box-shadow: 0 8px 18px rgb(0 0 0 / 16%);
                opacity: 1;
                transition: opacity 140ms ease;
            }

            .jump-to-latest.is-hidden {
                opacity: 0;
                pointer-events: none;
            }

            .jump-to-latest:hover:not(:disabled) {
                background: color-mix(
                    in oklab,
                    var(--gs-theme-primary, #6c82ab) 15%,
                    white
                );
            }

            .jump-to-latest svg {
                width: 0.9em;
                height: 0.9em;
                flex: 0 0 auto;
            }

            .empty-state {
                display: grid;
                gap: 0.7rem;
                padding: var(--gs-basic-spacing, 10px);
                border: 1px solid var(--gs-dialog-stroke-color, #d0d0d0);
                border-radius: 4px;
                background: white;
                color: #444;
            }

            .empty-state strong {
                color: #222;
            }

            .empty-examples {
                display: grid;
                gap: 0.35rem;
                margin: 0;
                padding-left: 1.1rem;
            }

            .composer {
                display: grid;
                flex: 0 0 auto;
                gap: 0.35rem;
                padding: var(--gs-basic-spacing, 10px);
                padding-top: 0;
            }

            .composer-input {
                position: relative;
            }

            .composer textarea {
                display: block;
                width: 100%;
                min-height: 2.75rem;
                max-height: 12rem;
                field-sizing: content;
                padding: 0.65rem 3rem 0.65rem 0.75rem;
                border: var(--form-control-border);
                border-radius: calc(var(--form-control-border-radius) * 1.5);
                font: inherit;
                line-height: 1.35;
                color: var(--form-control-color);
                background: #fff;
                box-sizing: border-box;
                resize: none;
                box-shadow: 0px 3px 10px rgba(0, 0, 0, 0.1);
            }

            .composer textarea:focus {
                outline: none;
            }

            .composer-action {
                position: absolute;
                right: calc(0.325rem + 1px);
                bottom: calc(0.325rem + 1px);
                align-items: center;
                justify-content: center;
                width: 2rem;
                height: 2rem;
                padding: 0;
                border: 1px solid transparent;
                border-radius: var(--form-control-border-radius);
                color: white;
                background: var(--gs-theme-primary, #6c82ab);
                transition:
                    opacity 140ms ease,
                    background-color 120ms ease,
                    transform 120ms ease;
            }

            .composer-action.is-hidden {
                opacity: 0;
                pointer-events: none;
            }

            .composer-action:hover:not(:disabled):not(.is-hidden) {
                background: oklch(
                    from var(--gs-theme-primary, #6c82ab) calc(l - 0.08) c h
                );
            }

            .composer-action:active:not(:disabled):not(.is-hidden) {
                transform: scale(0.96);
            }

            .composer-action svg {
                width: 0.9rem;
                height: 0.9rem;
            }

            .composer-footer {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                gap: 1rem;
                color: #666;
                font-size: 0.8rem;
                flex-wrap: wrap;
            }

            .composer-hint {
                min-width: 0;
            }
        `,
    ];

    constructor() {
        super();

        /** @type {AgentChatController | undefined} */
        this.controller = undefined;
        this.panelTitle = "GenomeSpy Agent";
        this.draft = "";
        /** @type {ChatSessionSnapshot} */
        this.snapshot = EMPTY_SNAPSHOT;
        /** @type {string[]} */
        this.expandedToolResultKeys = [];
        this.streamTurnId = 0;
        this.streamStatus = "idle";
        this.streamDraftText = "";
        this.streamReasoningText = "";
        this.streamHeartbeatTick = 0;
        this.devMode = false;
    }

    /** @type {(() => void) | null} */
    #unsubscribeController = null;

    /** @type {AgentChatController | undefined} */
    #boundController = undefined;

    /** @type {(() => void) | null} */
    #unsubscribeActiveTurn = null;

    /** @type {boolean} */
    #isTranscriptPinnedToBottom = true;

    connectedCallback() {
        super.connectedCallback();
        this.#syncController();
    }

    disconnectedCallback() {
        this.#unsubscribeController?.();
        this.#unsubscribeController = null;
        this.#boundController?.close();
        this.#boundController = undefined;
        super.disconnectedCallback();
    }

    /**
     * @param {Map<string, unknown>} changedProperties
     */
    updated(changedProperties) {
        if (changedProperties.has("controller")) {
            this.#syncController();
        }

        if (changedProperties.has("snapshot")) {
            if (this.#isTranscriptPinnedToBottom) {
                void this.#scrollTranscriptToEnd("auto");
            }
        }

        if (
            changedProperties.has("streamDraftText") ||
            changedProperties.has("streamReasoningText") ||
            changedProperties.has("streamStatus") ||
            changedProperties.has("streamHeartbeatTick")
        ) {
            if (this.#isTranscriptPinnedToBottom) {
                void this.#scrollTranscriptToEnd("auto");
            }
        }
    }

    render() {
        const snapshot = this.snapshot ?? EMPTY_SNAPSHOT;
        return html`
            <section class="panel">
                <header>
                    <div class="header-main">
                        <div class="title-row">
                            ${icon(faRobot).node[0]}
                            <div class="title">${this.panelTitle}</div>
                        </div>
                        <div class="status">
                            ${this.#getStatusLabel(snapshot.status)}
                            ${snapshot.pendingRequest
                                ? html`&nbsp;·&nbsp;${snapshot.pendingRequest
                                      .message}`
                                : nothing}
                            ${snapshot.queuedMessageCount > 0
                                ? html`&nbsp;·&nbsp;${snapshot.queuedMessageCount}
                                  queued`
                                : nothing}
                        </div>
                    </div>

                    <div class="header-actions"></div>
                </header>

                <div class="body">
                    <div class="transcript-shell">
                        <section
                            class="transcript"
                            @scroll=${this.#handleTranscriptScroll}
                        >
                            ${snapshot.messages.length === 0
                                ? this.#renderEmptyState()
                                : repeat(
                                      snapshot.messages,
                                      (message) => message.id,
                                      (message) => html`
                                          <gs-chat-message
                                              class=${this.#messageClass(
                                                  message.kind
                                              )}
                                              .message=${message}
                                              .devMode=${this.devMode}
                                              .expandedToolResultKeys=${this
                                                  .expandedToolResultKeys}
                                              .onSubmitMessage=${this
                                                  .#handleMessageSubmit}
                                              .onToggleToolResultPayload=${this
                                                  .#handleToggleToolResultPayload}
                                          ></gs-chat-message>
                                      `
                                  )}
                            <gs-chat-stream
                                .streamStatus=${this.streamStatus}
                                .pendingResponsePlaceholder=${snapshot.pendingResponsePlaceholder}
                                .streamDraftText=${this.streamDraftText}
                                .streamReasoningText=${this.streamReasoningText}
                            ></gs-chat-stream>
                        </section>

                        <button
                            type="button"
                            class="btn jump-to-latest ${this
                                .#isTranscriptPinnedToBottom
                                ? "is-hidden"
                                : "is-visible"}"
                            @click=${this.#jumpToLatest}
                            aria-hidden=${this.#isTranscriptPinnedToBottom}
                            tabindex=${this.#isTranscriptPinnedToBottom
                                ? -1
                                : 0}
                        >
                            ${icon(faChevronDown).node[0]} Jump to latest
                        </button>
                    </div>

                    <form class="composer" @submit=${this.#handleSubmit}>
                        <div class="composer-input">
                            <textarea
                                .value=${this.draft}
                                placeholder="Ask the agent about the current visualization or request an action."
                                ?disabled=${!this.controller}
                                @input=${this.#handleDraftInput}
                                @keydown=${this.#handleComposerKeyDown}
                            ></textarea>
                            ${this.#hasActiveLoop()
                                ? html`
                                      <button
                                          type="button"
                                          class="composer-action"
                                          title="Stop"
                                          aria-label="Stop"
                                          @click=${() =>
                                              this.controller?.stopCurrentTurn?.()}
                                      >
                                          ${icon(faStop).node[0]}
                                      </button>
                                  `
                                : html`
                                      <button
                                          type="submit"
                                          class="composer-action ${this.draft.trim()
                                              .length > 0
                                              ? ""
                                              : "is-hidden"}"
                                          title="Send"
                                          aria-label="Send"
                                          aria-hidden=${this.draft.trim()
                                              .length > 0
                                              ? "false"
                                              : "true"}
                                          tabindex=${this.draft.trim().length >
                                          0
                                              ? 0
                                              : -1}
                                          ?disabled=${!this.controller ||
                                          this.draft.trim().length === 0}
                                      >
                                          ${icon(faPaperPlane).node[0]}
                                      </button>
                                  `}
                        </div>
                    </form>
                </div>
            </section>
        `;
    }

    /**
     * @param {import("./chatMessage.js").ChatMessage["kind"]} kind
     * @returns {string}
     */
    #messageClass(kind) {
        if (kind === "tool_call") {
            return "tool-call";
        }

        if (kind === "tool_result") {
            return "tool-result";
        }

        return kind;
    }

    /**
     * @returns {import("lit").TemplateResult}
     */
    #renderEmptyState() {
        return html`
            <article class="empty-state">
                <strong>Start a conversation</strong>
                <div>
                    Ask about the current visualization, request a filter, or
                    ask for a sort / grouping action.
                </div>
                <ul class="empty-examples">
                    <li>What does this view show?</li>
                </ul>
            </article>
        `;
    }

    /**
     * @returns {boolean}
     */
    #hasActiveLoop() {
        return (
            this.streamStatus !== "idle" ||
            this.snapshot.pendingRequest !== null
        );
    }

    /**
     * @param {string} key
     */
    #toggleToolResultPayload(key) {
        this.expandedToolResultKeys = this.expandedToolResultKeys.includes(key)
            ? this.expandedToolResultKeys.filter(
                  (existingKey) => existingKey !== key
              )
            : [...this.expandedToolResultKeys, key];
    }

    /**
     * @param {Event} event
     */
    #handleDraftInput = (event) => {
        this.draft = /** @type {HTMLTextAreaElement} */ (event.target).value;
    };

    /**
     * @param {KeyboardEvent} event
     */
    #handleComposerKeyDown = (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            void this.#handleSubmit(event);
        }
    };

    /**
     * @param {Event} event
     */
    #handleSubmit = (event) => {
        event.preventDefault();
        if (this.#hasActiveLoop()) {
            this.controller?.stopCurrentTurn?.();
            return;
        }

        void this.#submitMessage(this.draft);
    };

    /**
     * @param {string} text
     * @returns {Promise<void>}
     */
    async #submitMessage(text) {
        const trimmed = text.trim();
        if (!trimmed) {
            return;
        }

        if (!this.controller) {
            return;
        }

        this.draft = "";
        void this.controller.sendMessage(trimmed);
    }

    /**
     * @param {string} value
     */
    #handleMessageSubmit = (value) => {
        void this.#submitMessage(value);
    };

    /**
     * @param {string} key
     */
    #handleToggleToolResultPayload = (key) => {
        this.#toggleToolResultPayload(key);
    };

    /**
     * Track whether the transcript is pinned to the bottom.
     *
     * @param {Event} event
     */
    #handleTranscriptScroll = (event) => {
        const transcript = /** @type {HTMLElement} */ (event.currentTarget);
        const wasPinned = this.#isTranscriptPinnedToBottom;
        this.#isTranscriptPinnedToBottom =
            transcript.scrollHeight -
                transcript.scrollTop -
                transcript.clientHeight <=
            24;
        if (this.#isTranscriptPinnedToBottom !== wasPinned) {
            this.requestUpdate();
        }
    };

    #jumpToLatest = () => {
        if (!this.#isTranscriptPinnedToBottom) {
            this.#isTranscriptPinnedToBottom = true;
            this.requestUpdate();
        }
        void this.#scrollTranscriptToEnd("smooth");
    };

    /**
     * Scroll the transcript to the newest content.
     *
     * @param {"auto" | "smooth"} behavior
     */
    async #scrollTranscriptToEnd(behavior = "auto") {
        await this.updateComplete;
        const transcript = this.renderRoot.querySelector(".transcript");
        if (transcript) {
            if (!this.#isTranscriptPinnedToBottom) {
                this.#isTranscriptPinnedToBottom = true;
                this.requestUpdate();
            }
            transcript.scrollTo({
                top: transcript.scrollHeight,
                behavior,
            });
        }
    }

    /**
     * @param {ChatSessionSnapshot["status"]} status
     * @returns {string}
     */
    #getStatusLabel(status) {
        switch (status) {
            case "ready":
                return "Ready";
            case "preflighting":
                return "Checking availability";
            case "thinking":
                return "Thinking";
            case "executing":
                return "Executing";
            case "unavailable":
                return "Agent unavailable";
            case "error":
                return "Error";
            default:
                return status;
        }
    }

    /**
     * Keep the panel in sync with the controller snapshot.
     */
    #syncController() {
        if (this.#boundController === this.controller) {
            return;
        }

        this.#unsubscribeController?.();
        this.#unsubscribeController = null;
        this.#unsubscribeActiveTurn?.();
        this.#unsubscribeActiveTurn = null;
        this.#boundController = this.controller;
        this.streamTurnId = 0;
        this.streamStatus = "idle";
        this.streamDraftText = "";
        this.streamReasoningText = "";
        this.streamHeartbeatTick = 0;
        this.#isTranscriptPinnedToBottom = true;

        if (!this.controller) {
            this.snapshot = EMPTY_SNAPSHOT;
            return;
        }

        this.snapshot = this.controller.getSnapshot();
        this.#unsubscribeController = this.controller.subscribe((snapshot) => {
            this.snapshot = snapshot;
        });
        if (this.controller.subscribeToActiveTurn) {
            this.#unsubscribeActiveTurn = this.controller.subscribeToActiveTurn(
                (snapshot) => {
                    this.#handleActiveTurnSnapshot(snapshot);
                }
            );
        }
        void this.controller.open();
    }

    /**
     * @param {AgentActiveTurnSnapshot | null} snapshot
     */
    #handleActiveTurnSnapshot(snapshot) {
        if (!snapshot) {
            this.streamTurnId = 0;
            this.streamStatus = "idle";
            this.streamDraftText = "";
            this.streamReasoningText = "";
            this.streamHeartbeatTick = 0;
            return;
        }

        if (snapshot.turnId < this.streamTurnId) {
            return;
        }

        this.streamTurnId = snapshot.turnId;
        this.streamStatus = snapshot.status;
        this.streamDraftText = snapshot.draftText;
        this.streamReasoningText = snapshot.reasoningText;
        this.streamHeartbeatTick = snapshot.heartbeatTick;
    }
}

customElements.define("gs-agent-chat-panel", AgentChatPanel);

/**
 * Toggle the agent chat side panel in the app shell.
 *
 * @param {any} app
 * @returns {Promise<void>}
 */
export async function toggleAgentChatPanel(app) {
    const agentState = getAgentState(app);
    if (!agentState.agentAdapter) {
        return;
    }

    let host = agentState.agentChatPanelHost;

    if (!host) {
        host = document.createElement("div");
        host.dataset.agentChatPanelHost = "true";
        host.style.height = "100%";
        host.style.minHeight = "0";

        const panel = /** @type {AgentChatPanel} */ (
            document.createElement("gs-agent-chat-panel")
        );
        agentState.agentSessionController ??= createAgentSessionController(
            agentState.agentAdapter
        );
        panel.controller = agentState.agentSessionController;
        panel.devMode = true;
        host.append(panel);

        agentState.agentChatPanelHandle = app.ui.registerSidePanel({
            id: "agent-chat",
            element: host,
            preferredWidth: "min(36vw, 600px)",
        });
        agentState.agentChatPanelHandle.show();
        agentState.agentChatPanelHost = host;
        await panel.updateComplete;
        const textarea = panel.renderRoot.querySelector("textarea");
        textarea?.focus();
        return;
    }

    if (agentState.agentChatPanelHandle.toggle()) {
        const panel = /** @type {AgentChatPanel | null} */ (
            host.querySelector("gs-agent-chat-panel")
        );
        if (panel) {
            await panel.updateComplete;
            const textarea = panel.renderRoot.querySelector("textarea");
            textarea?.focus();
        }
    }
}

/**
 * Replaces the current chat session with a fresh controller.
 *
 * @param {any} app
 */
export function clearAgentChatHistory(app) {
    const agentState = getAgentState(app);
    if (!agentState.agentAdapter) {
        return;
    }

    agentState.agentSessionController?.stopCurrentTurn?.();
    agentState.agentSessionController = createAgentSessionController(
        agentState.agentAdapter
    );

    const panel = /** @type {AgentChatPanel | null} */ (
        agentState.agentChatPanelHost?.querySelector("gs-agent-chat-panel")
    );
    if (panel) {
        panel.controller = agentState.agentSessionController;
    }
}
