import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationTriangle,
    faInfoCircle,
    faRobot,
} from "@fortawesome/free-solid-svg-icons";
import { css, html, LitElement, nothing } from "lit";
import { faStyles, formStyles } from "../components/generic/componentStyles.js";
import { createAgentSessionController } from "./agentSessionController.js";
import safeMarkdown from "../utils/safeMarkdown.js";

/**
 * @typedef {import("./types.d.ts").IntentProgramSummaryLine} IntentProgramSummaryLine
 * @typedef {{
 *     value: string;
 *     label: string;
 *     description?: string;
 * }} ChatClarificationOption
 *
 * @typedef {{
 *     id: number;
 *     kind: "user" | "assistant" | "clarification" | "plan" | "result" | "error";
 *     text?: string | import("lit").TemplateResult;
 *     lines?: IntentProgramSummaryLine[];
 *     options?: ChatClarificationOption[];
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
 * }} ChatSessionSnapshot
 *
 * @typedef {{
 *     getSnapshot(): ChatSessionSnapshot;
 *     subscribe(listener: (snapshot: ChatSessionSnapshot) => void): () => void;
 *     open(): Promise<void>;
 *     close(): void;
 *     sendMessage(message: string): Promise<void>;
 *     queueMessage(message: string): Promise<void>;
 *     refreshPreflight(): Promise<void>;
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
};

export default class AgentChatPanel extends LitElement {
    static properties = {
        controller: { attribute: false },
        panelTitle: { type: String },
        snapshot: { state: true },
        draft: { state: true },
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

            .panel {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 640px;
                overflow: hidden;
                border: 1px solid var(--gs-dialog-stroke-color, #d0d0d0);
                border-top: 3px solid var(--gs-theme-primary, #6c82ab);
                border-radius: 4px;
                background: white;
                box-shadow: 0px 3px 15px 0px rgba(0, 0, 0, 0.21);
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
                border-left-width: 4px;
                border-left-color: var(--gs-theme-primary, #6c82ab);
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
                border-left-width: 4px;
            }

            .message.user {
                align-self: flex-end;
                max-width: min(78%, 40rem);
                border-left-color: var(--gs-theme-primary, #6c82ab);
                border-color: color-mix(
                    in oklab,
                    var(--gs-theme-primary, #6c82ab) 30%,
                    #d0d0d0
                );
                background: color-mix(
                    in oklab,
                    var(--gs-theme-primary, #6c82ab) 8%,
                    white
                );
                border-radius: 14px 14px 4px 14px;
            }

            .message.assistant {
                align-self: flex-start;
                max-width: min(84%, 44rem);
                padding: 0.25rem 0.15rem;
                border: none;
                background: transparent;
                border-left-width: 0;
            }

            .assistant-body {
                display: grid;
                gap: 0.6rem;
            }

            .assistant-body .markdown > :first-child {
                margin-top: 0;
            }

            .assistant-body .markdown > :last-child {
                margin-bottom: 0;
            }

            .message.plan {
                border-left-color: #b98f2d;
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

            .message-lines li {
                line-height: 1.45;
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
    }

    /** @type {(() => void) | null} */
    #unsubscribeController = null;

    /** @type {AgentChatController | undefined} */
    #boundController = undefined;

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
                            : snapshot.messages.map((message) =>
                                  this.#renderMessage(message)
                              )}
                        ${snapshot.pendingResponsePlaceholder
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
                                this.draft.trim().length === 0}
                                class="btn btn-primary"
                            >
                                Send
                            </button>
                        </div>

                        <div class="composer-footer">
                            <div class="composer-hint">
                                Shift+Enter inserts a new line.
                                ${snapshot.lastError
                                    ? html`<span>
                                          Last error:
                                          ${snapshot.lastError}</span
                                      >`
                                    : nothing}
                            </div>
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
                    <li>Sort samples by age.</li>
                    <li>Filter to diagnosis = AML.</li>
                </ul>
            </article>
        `;
    }

    /**
     * @param {ChatMessage} message
     * @returns {import("lit").TemplateResult}
     */
    #renderMessage(message) {
        if (message.kind === "clarification") {
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
        } else if (message.kind === "plan") {
            return html`
                <article class="message plan">
                    <div class="message-title">
                        ${icon(faInfoCircle).node[0]} Plan preview
                    </div>
                    ${message.text
                        ? html`<div class="message-text">
                              ${this.#renderMarkdown(message.text)}
                          </div>`
                        : nothing}
                    ${message.lines?.length
                        ? html`
                              <ul class="message-lines">
                                  ${message.lines.map(
                                      (line) => html`<li>${line.content}</li>`
                                  )}
                              </ul>
                          `
                        : nothing}
                    ${this.#renderTimingNote(message.durationMs)}
                </article>
            `;
        } else if (message.kind === "result") {
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
        } else if (message.kind === "error") {
            return html`
                <article class="message error">
                    <div class="message-title">
                        ${icon(faExclamationTriangle).node[0]} Error
                    </div>
                    <div class="message-text">${message.text ?? ""}</div>
                </article>
            `;
        } else if (message.kind === "assistant") {
            return html`
                <article class="message assistant">
                    <div class="assistant-body">
                        ${this.#renderMarkdown(message.text ?? "")}
                    </div>
                    ${this.#renderTimingNote(message.durationMs)}
                </article>
            `;
        } else {
            return html`
                <article class="message user">
                    <div class="message-text">${message.text ?? ""}</div>
                </article>
            `;
        }
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
        this.#boundController = this.controller;

        if (!this.controller) {
            this.snapshot = EMPTY_SNAPSHOT;
            return;
        }

        this.snapshot = this.controller.getSnapshot();
        this.#unsubscribeController = this.controller.subscribe((snapshot) => {
            this.snapshot = snapshot;
        });
        void this.controller.open();
    }
}

customElements.define("gs-agent-chat-panel", AgentChatPanel);

/**
 * Toggle the docked agent chat panel in the app shell.
 *
 * @param {import("../app.js").default} app
 * @returns {Promise<void>}
 */
export async function toggleAgentChatPanel(app) {
    if (!app.agentAdapter) {
        return;
    }

    const appRoot = /** @type {HTMLElement | null} */ (
        app.appContainer.querySelector(".genome-spy-app")
    );
    if (!appRoot) {
        return;
    }

    let host = /** @type {HTMLElement | null} */ (
        appRoot.querySelector("[data-agent-chat-panel-host]")
    );

    if (!host) {
        host = document.createElement("div");
        host.dataset.agentChatPanelHost = "true";
        host.hidden = false;
        host.style.position = "absolute";
        host.style.top = "calc(var(--gs-basic-spacing, 10px) + 38px)";
        host.style.right = "var(--gs-basic-spacing, 10px)";
        host.style.bottom = "var(--gs-basic-spacing, 10px)";
        host.style.width = "min(42rem, 42vw)";
        host.style.minWidth = "320px";
        host.style.maxWidth = "100%";
        host.style.zIndex = "40";
        host.style.boxShadow = "-8px 0 24px rgba(0, 0, 0, 0.24)";
        host.style.background = "white";
        host.style.overflow = "hidden";

        const panel = /** @type {AgentChatPanel} */ (
            document.createElement("gs-agent-chat-panel")
        );
        app.agentSessionController ??= createAgentSessionController(
            app.agentAdapter
        );
        panel.controller = app.agentSessionController;
        host.append(panel);

        appRoot.append(host);
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
