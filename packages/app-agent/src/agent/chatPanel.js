import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationTriangle,
    faInfoCircle,
    faRobot,
} from "@fortawesome/free-solid-svg-icons";
import { css, html, LitElement, nothing } from "lit";
import {
    faStyles,
    formStyles,
    safeMarkdown,
} from "@genome-spy/app/agentShared";
import { createAgentSessionController } from "./agentSessionController.js";
import { getAgentState } from "./agentState.js";
import { repeat } from "lit/directives/repeat.js";

/**
 * @typedef {import("./types.d.ts").IntentBatchSummaryLine} IntentBatchSummaryLine
 * @typedef {{
 *     value: string;
 *     label: string;
 *     description?: string;
 * }} ChatClarificationOption
 *
 * @typedef {import("./types.d.ts").AgentToolCall} AgentToolCall
 *
 * @typedef {{
 *     id: number;
 *     kind:
 *         | "user"
 *         | "assistant"
 *         | "clarification"
 *         | "result"
 *         | "tool_call"
 *         | "tool_result"
 *         | "error";
 *     text?: string | import("lit").TemplateResult;
 *     lines?: IntentBatchSummaryLine[];
 *     options?: ChatClarificationOption[];
 *     toolCalls?: AgentToolCall[];
 *     toolCallId?: string;
 *     content?: unknown;
 *     durationMs?: number | null;
 * }} ChatMessage
 *
 * @typedef {{
 *     status:
 *         | "ready"
 *         | "preflighting"
 *         | "thinking"
 *         | "clarification"
 *         | "executing"
 *         | "unavailable"
 *         | "error";
 *     preflightState: "idle" | "running" | "ready" | "failed";
 *     messages: ChatMessage[];
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
 *         toolCalls: AgentToolCall[]
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
                min-height: 640px;
                color: #222;
                font-family: var(--gs-font-family, sans-serif);
            }

            .tool-call {
                --accent-color: #c77d20;
            }

            .tool-result {
                --accent-color: #4f8a4f;
            }

            .panel {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 640px;
                overflow: hidden;
                border-top: 3px solid var(--gs-theme-primary, #6c82ab);
                border-radius: 4px;
                box-shadow: 0 0 15px rgba(0, 0, 0, 0.3);
            }

            header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--gs-basic-spacing, 10px);
                padding: var(--gs-basic-spacing, 10px);
                border-bottom: 1px solid var(--gs-dialog-stroke-color, #d0d0d0);
                background: white;
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

            .body {
                display: flex;
                flex-direction: column;
                min-height: 0;
                flex: 1 1 auto;
            }

            .transcript {
                display: flex;
                flex-direction: column;
                flex: 1 1 auto;
                gap: 0.65rem;
                min-height: 0;
                overflow: auto;
                padding: var(--gs-basic-spacing, 10px);
                background: #fafafa;
            }

            .transcript-placeholder {
                display: inline-flex;
                align-items: center;
                gap: 0.45rem;
                padding: 0.25rem 0.15rem;
                color: #8a8f98;
                font-style: italic;
                font-size: 0.95em;
            }

            .transcript-placeholder .spinner {
                width: 0.8em;
                height: 0.8em;
                border-radius: 50%;
                border: 2px solid rgb(138 143 152 / 35%);
                border-top-color: rgb(138 143 152 / 90%);
                animation: chat-panel-spin 0.8s linear infinite;
                flex: 0 0 auto;
            }

            @keyframes chat-panel-spin {
                to {
                    transform: rotate(360deg);
                }
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

            .message {
                display: grid;
                gap: 0.35rem;
                width: 100%;
                box-sizing: border-box;
                padding: 0.75rem 0.85rem;
                border: 1px solid var(--gs-dialog-stroke-color, #d0d0d0);
                border-radius: 4px;
                background: white;

                &.user {
                    align-self: flex-end;
                    max-width: min(78%, 40rem);
                    border: none;
                    background: #ececec;
                    border-radius: 14px 14px 2px 14px;
                }

                &.assistant {
                    align-self: flex-start;
                    max-width: min(84%, 44rem);
                    padding: 0.25rem 0.15rem;
                    border: none;
                    background: transparent;
                    border-left-width: 0;
                }

                &.assistant.streaming {
                    display: grid;
                    gap: 0.45rem;
                    max-width: min(84%, 44rem);
                    padding: 0.25rem 0.15rem;
                    border: none;
                    background: transparent;
                    border-left-width: 0;
                }
            }

            .assistant-body {
                display: grid;
                gap: 0.5em;
            }

            .streaming-body {
                display: grid;
                gap: 0.45rem;
                line-height: 1.45;
            }

            .streaming-status {
                display: inline-flex;
                align-items: center;
                gap: 0.45rem;
                color: #8a8f98;
                font-style: italic;
                font-size: 0.95em;
            }

            .streaming-status .spinner {
                width: 0.8em;
                height: 0.8em;
                border-radius: 50%;
                border: 2px solid rgb(138 143 152 / 35%);
                border-top-color: rgb(138 143 152 / 90%);
                animation: chat-panel-spin 0.8s linear infinite;
                flex: 0 0 auto;
            }

            .streaming-draft {
                white-space: pre-wrap;
                color: #222;
            }

            .streaming-reasoning {
                white-space: pre-wrap;
                color: #666;
                font-size: 0.88rem;
            }

            .markdown {
                > :first-child {
                    margin-top: 0;
                }

                > :last-child {
                    margin-bottom: 0;
                }
            }

            .message.result {
                border-left-color: #4d8c52;
            }

            .message.clarification {
                border-left-color: #5f84b8;
            }

            .message.error {
                border-left-color: #b55454;
            }

            .message-title {
                display: flex;
                align-items: center;
                gap: 0.45rem;
                font-size: 0.86rem;
                font-weight: 700;
                color: #444;
            }

            .message-title svg {
                width: 0.95em;
                height: 0.95em;
                flex: 0 0 auto;
                color: var(--gs-theme-primary, #6c82ab);
            }

            .message-text {
                line-height: 1.45;
                color: #222;
            }

            .message.tool {
                border-color: color-mix(
                    in oklab,
                    var(--accent-color) 30%,
                    white
                );
                background-color: color-mix(
                    in oklab,
                    var(--accent-color) 7%,
                    white
                );
            }

            .tool-list {
                display: grid;
                gap: 0.5rem;
                margin: 0;
                padding: 0;
            }

            .tool-item {
                display: grid;
                gap: 0.3rem;
                padding: 0.55rem 0.65rem;
                border: 1px solid;
                border-radius: 4px;
                border-color: color-mix(
                    in oklab,
                    var(--accent-color) 50%,
                    white
                );
                background: color-mix(in oklab, var(--accent-color) 15%, white);
            }

            .tool-name {
                font-size: 0.9rem;
                font-weight: 700;
                color: color-mix(in oklab, var(--accent-color) 62%, black);
            }

            .tool-meta {
                color: #6d6d6d;
                font-size: 0.78rem;
            }

            .tool-args,
            .tool-text {
                margin: 0;
                padding: 0.5rem 0.6rem;
                border-radius: 4px;
                background: rgb(255 255 255 / 75%);
                color: color-mix(in oklab, var(--accent-color) 40%, black);
                font-family: var(--gs-mono-font-family, monospace);
                font-size: 0.8rem;
                line-height: 1.35;
                overflow-x: auto;
            }

            .tool-body {
                display: grid;
                gap: 0.5rem;
            }

            .tool-result-toggle {
                justify-self: start;
                padding: 0;
                border: none;
                background: none;
                color: var(--gs-theme-primary, #6c82ab);
                font: inherit;
                font-size: 0.82rem;
                font-weight: 600;
                cursor: pointer;
                text-decoration: underline;
                text-underline-offset: 0.12em;
            }

            .tool-result-toggle:hover {
                color: color-mix(
                    in oklab,
                    var(--gs-theme-primary, #6c82ab) 80%,
                    black
                );
            }

            .tool-result-toggle:focus-visible {
                outline: 2px solid
                    color-mix(
                        in oklab,
                        var(--gs-theme-primary, #6c82ab) 55%,
                        white
                    );
                outline-offset: 2px;
                border-radius: 3px;
            }

            .tool-payload {
                margin: 0;
                padding: 0.6rem 0.7rem;
                border-radius: 4px;

                background: color-mix(in oklab, var(--accent-color) 5%, white);

                color: #2b2b2b;
                font-family: var(--gs-mono-font-family, monospace);
                font-size: 0.8rem;
                line-height: 1.35;
                white-space: pre-wrap;
                overflow-x: auto;
            }

            .message-dev-note {
                margin-top: 0.2rem;
                color: #777;
                font-size: 0.78rem;
            }

            .message-lines {
                display: grid;
                gap: 0.4rem;
                margin: 0;
                padding-left: 1.15rem;
            }

            .clarification-options {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
                padding-top: 0.15rem;
            }

            .clarification-options .btn {
                padding: 0.35rem 0.75rem;
            }

            .composer {
                display: grid;
                flex: 0 0 auto;
                gap: 0.35rem;
                padding: var(--gs-basic-spacing, 10px);
                border-top: 1px solid var(--gs-dialog-stroke-color, #d0d0d0);
                background: white;
            }

            .composer-row {
                display: flex;
                align-items: flex-end;
                gap: 0.65rem;
            }

            .composer textarea {
                flex: 1 1 auto;
                min-height: 4.75rem;
                resize: vertical;
                padding: 0.375em 0.75em;
                border: var(--form-control-border);
                border-radius: var(--form-control-border-radius);
                font: inherit;
                color: var(--form-control-color);
                background: #fff;
                box-sizing: border-box;
            }

            .composer textarea:focus {
                border-color: var(--gs-theme-primary, #6c82ab);
                box-shadow: 0 0 0 0.2rem rgb(108 130 171 / 25%);
            }

            .composer .btn.btn-primary {
                background-color: var(--gs-theme-primary, #6c82ab);
                background-image: linear-gradient(
                    to bottom,
                    oklch(
                        from var(--gs-theme-primary, #6c82ab) calc(l + 0.07) c h
                    ),
                    oklch(
                        from var(--gs-theme-primary, #6c82ab) calc(l - 0.07) c h
                    )
                );
                border-color: oklch(
                    from var(--gs-theme-primary, #6c82ab) calc(l - 0.08) c h
                );
                color: var(--gs-theme-on-primary, #ffffff);
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
            }

            .composer .btn.btn-primary:hover:not(:disabled) {
                background-image: linear-gradient(
                    to bottom,
                    oklch(
                        from var(--gs-theme-primary, #6c82ab) calc(l + 0.1) c h
                    ),
                    oklch(
                        from var(--gs-theme-primary, #6c82ab) calc(l - 0.04) c h
                    )
                );
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
        this.panelTitle = "Agent Chat";
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
            void this.#scrollTranscriptToEnd();
        }

        if (
            changedProperties.has("streamDraftText") ||
            changedProperties.has("streamReasoningText") ||
            changedProperties.has("streamStatus") ||
            changedProperties.has("streamHeartbeatTick")
        ) {
            void this.#scrollTranscriptToEnd();
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
                    <section class="transcript">
                        ${snapshot.messages.length === 0
                            ? this.#renderEmptyState()
                            : repeat(
                                  snapshot.messages,
                                  (message) => message.id,
                                  (message) => this.#renderMessage(message)
                              )}
                        ${this.#hasActiveStream()
                            ? this.#renderActiveTurnDraft(snapshot)
                            : snapshot.pendingResponsePlaceholder
                              ? html`<div class="transcript-placeholder">
                                    <span class="spinner"></span>
                                    <span
                                        >${snapshot.pendingResponsePlaceholder}</span
                                    >
                                </div>`
                              : nothing}
                    </section>

                    <form class="composer" @submit=${this.#handleSubmit}>
                        <div class="composer-row">
                            <textarea
                                .value=${this.draft}
                                placeholder="Ask the agent about the current visualization or request an action."
                                ?disabled=${!this.controller}
                                @input=${this.#handleDraftInput}
                                @keydown=${this.#handleComposerKeyDown}
                            ></textarea>
                            <button
                                type="submit"
                                ?disabled=${!this.controller ||
                                (!this.#hasActiveLoop() &&
                                    this.draft.trim().length === 0)}
                                class="btn btn-primary"
                            >
                                ${this.#hasActiveLoop() ? "Stop" : "Send"}
                            </button>
                        </div>
                    </form>
                </div>
            </section>
        `;
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
     * @param {ChatMessage} message
     */
    #renderMessage(message) {
        switch (message.kind) {
            case "clarification":
                return this.#renderClarification(message);
            case "result":
                return this.#renderResult(message);
            case "error":
                return this.#renderError(message);
            case "tool_result":
                return this.#renderToolResult(message);
            case "tool_call":
                return this.#renderToolCall(message);
            case "assistant":
                return this.#renderAssistant(message);
            default:
                return this.#renderUser(message);
        }
    }

    /* Individual render helpers for message kinds */
    /**
     * @param {ChatMessage} message
     */
    #renderClarification(message) {
        return html`
            <article class="message clarification">
                <div class="message-title">
                    ${icon(faInfoCircle).node[0]} Clarification
                </div>
                <div class="message-text">
                    ${this.#renderMarkdown(message.text ?? "")}
                </div>
                ${message.options?.length
                    ? html`<div class="clarification-options">
                          ${message.options.map(
                              (option) => html`
                                  <button
                                      class="btn"
                                      type="button"
                                      @click=${() =>
                                          this.#submitMessage(option.value)}
                                  >
                                      ${option.label}
                                  </button>
                              `
                          )}
                      </div>`
                    : nothing}
                ${this.#renderTimingNote(message.durationMs)}
            </article>
        `;
    }

    /**
     * @param {ChatMessage} message
     */
    #renderResult(message) {
        return html`
            <article class="message result">
                <div class="message-title">
                    ${icon(faInfoCircle).node[0]} Execution result
                </div>
                ${message.text
                    ? html`<div class="message-text">
                          ${this.#renderMarkdown(message.text)}
                      </div>`
                    : nothing}
                ${message.lines?.length
                    ? html`
                          <ol class="message-lines">
                              ${message.lines.map(
                                  (line) => html`<li>${line.content}</li>`
                              )}
                          </ol>
                      `
                    : nothing}
                ${this.#renderTimingNote(message.durationMs)}
            </article>
        `;
    }

    /**
     * @param {ChatMessage} message
     */
    #renderError(message) {
        return html`
            <article class="message error">
                <div class="message-title">
                    ${icon(faExclamationTriangle).node[0]} Error
                </div>
                <div class="message-text">${message.text ?? ""}</div>
            </article>
        `;
    }

    /**
     * @param {ChatMessage} message
     */
    #renderToolResult(message) {
        if (!this.devMode) {
            return nothing;
        }

        const disclosureKey = this.#getToolResultDisclosureKey(message);
        const hasStructuredContent = message.content !== undefined;
        const payloadExpanded =
            hasStructuredContent &&
            this.expandedToolResultKeys.includes(disclosureKey);
        return html`
            <article class="message tool tool-result">
                <div class="message-title">
                    ${icon(faInfoCircle).node[0]} Tool result
                </div>
                <div class="tool-item">
                    <div class="tool-meta">
                        Call id: ${message.toolCallId ?? "n/a"}
                    </div>
                    <div class="tool-text">
                        ${this.#renderMarkdown(message.text ?? "")}
                    </div>
                    ${hasStructuredContent
                        ? html`
                              <button
                                  class="tool-result-toggle"
                                  type="button"
                                  @click=${() =>
                                      this.#toggleToolResultPayload(
                                          disclosureKey
                                      )}
                              >
                                  ${payloadExpanded
                                      ? "Hide JSON payload"
                                      : "Show JSON payload"}
                              </button>
                              ${payloadExpanded
                                  ? html`<pre class="tool-payload">
${this.#formatToolArguments(message.content)}</pre
                                    >`
                                  : nothing}
                          `
                        : nothing}
                </div>
                ${this.#renderTimingNote(message.durationMs)}
            </article>
        `;
    }

    /**
     * @param {ChatMessage} message
     */
    #renderToolCall(message) {
        const renderToolCalls = () => {
            return html`<div class="tool-list">
                ${message.toolCalls.map(
                    (toolCall) => html`
                        <div class="tool-item">
                            <div class="tool-name">${toolCall.name}</div>
                            <div class="tool-meta">
                                Call id: ${toolCall.callId}
                            </div>
                            <pre class="tool-payload">
${this.#formatToolArguments(toolCall.arguments)}</pre
                            >
                        </div>
                    `
                )}
            </div>`;
        };

        const renderCompactToolCalls = () => {
            return message.toolCalls.map(
                (toolCall) => html`
                    <div class="tool-name">${toolCall.name}</div>
                `
            );
        };

        return html`
            <article class="message tool tool-call">
                <div class="message-title">
                    ${icon(faRobot).node[0]} Tool call
                </div>
                <div class="assistant-body">
                    ${message.text
                        ? html`<div class="message-text">
                              ${this.#renderMarkdown(message.text)}
                          </div>`
                        : nothing}
                    ${message.toolCalls?.length
                        ? this.devMode
                            ? renderToolCalls()
                            : renderCompactToolCalls()
                        : nothing}
                </div>
                ${this.#renderTimingNote(message.durationMs)}
            </article>
        `;
    }

    /**
     * @param {ChatMessage} message
     */
    #renderAssistant(message) {
        return html`
            <article class="message assistant">
                <div class="assistant-body">
                    ${this.#renderMarkdown(message.text ?? "")}
                </div>
                ${this.#renderTimingNote(message.durationMs)}
            </article>
        `;
    }

    /**
     * @param {ChatMessage} message
     */
    #renderUser(message) {
        return html`
            <article class="message user">
                <div class="message-text">${message.text ?? ""}</div>
            </article>
        `;
    }

    /**
     * @returns {boolean}
     */
    #hasActiveStream() {
        return this.streamStatus !== "idle";
    }

    /**
     * @returns {boolean}
     */
    #hasActiveLoop() {
        return this.#hasActiveStream() || this.snapshot.pendingRequest !== null;
    }

    /**
     * @param {ChatSessionSnapshot} snapshot
     * @returns {import("lit").TemplateResult}
     */
    #renderActiveTurnDraft(snapshot) {
        const draftText = this.streamDraftText.trimStart();
        const reasoningText = this.streamReasoningText.trimStart();
        const hasVisibleDraft = draftText.length > 0;
        return html`
            <article class="message assistant streaming">
                ${hasVisibleDraft
                    ? html`<div class="assistant-body">
                          <div class="streaming-body">
                              <div class="streaming-draft">${draftText}</div>
                              ${reasoningText
                                  ? html`<div class="streaming-reasoning">
                                        ${reasoningText}
                                    </div>`
                                  : nothing}
                          </div>
                      </div>`
                    : html`<div class="streaming-status">
                          <span class="spinner"></span>
                          <span>${snapshot.pendingResponsePlaceholder}</span>
                      </div>`}
            </article>
        `;
    }

    /**
     * @param {string | import("lit").TemplateResult} content
     * @returns {import("lit").TemplateResult}
     */
    #renderMarkdown(content) {
        if (typeof content === "string") {
            return html`${safeMarkdown(content)}`;
        } else {
            return html`${content}`;
        }
    }

    /**
     * @param {unknown} value
     * @returns {string}
     */
    #formatToolArguments(value) {
        if (typeof value === "string") {
            return value;
        }

        try {
            return JSON.stringify(value, null, 2) ?? String(value);
        } catch {
            return String(value);
        }
    }

    /**
     * @param {ChatMessage} message
     * @returns {string}
     */
    #getToolResultDisclosureKey(message) {
        return message.toolCallId
            ? `tool-call:${message.toolCallId}`
            : `message:${message.id}`;
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
     * Scroll the transcript to the newest content.
     */
    async #scrollTranscriptToEnd() {
        await this.updateComplete;
        const transcript = this.renderRoot.querySelector(".transcript");
        if (transcript) {
            transcript.scrollTo({
                top: transcript.scrollHeight,
                behavior: "smooth",
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
            case "clarification":
                return "Need clarification";
            case "unavailable":
                return "Agent unavailable";
            case "error":
                return "Error";
            default:
                return status;
        }
    }

    /**
     * @param {number | null | undefined} durationMs
     * @returns {import("lit").TemplateResult | typeof nothing}
     */
    #renderTimingNote(durationMs) {
        if (
            !import.meta.env.DEV ||
            durationMs === null ||
            durationMs === undefined
        ) {
            return nothing;
        }

        const seconds = (durationMs / 1000).toFixed(2);
        return html`<div class="message-dev-note">
            Generated in ${seconds}s.
        </div>`;
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
 * Toggle the docked agent chat panel in the app shell.
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
        host.hidden = false;
        host.style.position = "absolute";
        host.style.top = "calc(var(--gs-basic-spacing, 10px) + 38px)";
        host.style.right = "var(--gs-basic-spacing, 10px)";
        host.style.bottom = "var(--gs-basic-spacing, 10px)";
        host.style.width = "min(70vw, 600px)";

        const panel = /** @type {AgentChatPanel} */ (
            document.createElement("gs-agent-chat-panel")
        );
        agentState.agentSessionController ??= createAgentSessionController(
            agentState.agentAdapter
        );
        panel.controller = agentState.agentSessionController;
        panel.devMode = true;
        host.append(panel);

        if (app.ui.registerDockedPanel) {
            app.ui.registerDockedPanel(host);
        } else {
            app.appContainer.append(host);
        }
        agentState.agentChatPanelHost = host;
        await panel.updateComplete;
        const textarea = panel.renderRoot.querySelector("textarea");
        textarea?.focus();
        return;
    }

    host.hidden = !host.hidden;
    if (!host.hidden) {
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
