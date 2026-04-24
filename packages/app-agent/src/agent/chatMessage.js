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
 */

export default class ChatMessageElement extends LitElement {
    static properties = {
        message: { attribute: false },
        devMode: { type: Boolean },
        expandedToolResultKeys: { attribute: false },
        onSubmitMessage: { attribute: false },
        onToggleToolResultPayload: { attribute: false },
    };

    static styles = [
        faStyles,
        formStyles,
        css`
            :host {
                display: block;
                width: 100%;
                box-sizing: border-box;
            }

            :host(.user) {
                align-self: flex-end;
                max-width: min(78%, 40rem);
            }

            :host(.assistant) {
                align-self: flex-start;
                max-width: min(84%, 44rem);
            }

            :host(.clarification) {
                --accent-color: #5f84b8;
            }

            :host(.result) {
                --accent-color: #4d8c52;
            }

            :host(.error) {
                --accent-color: #b55454;
            }

            :host(.tool-call) {
                --accent-color: #c77d20;
            }

            :host(.tool-result) {
                --accent-color: #4f8a4f;
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
            }

            .message.user {
                border: none;
                background: #ececec;
                border-radius: 14px 14px 2px 14px;
            }

            .message.assistant {
                padding: 0.25rem 0.15rem;
                border: none;
                background: transparent;
                border-left-width: 0;
            }

            .assistant-body {
                display: grid;
                gap: 0.5em;
            }

            .markdown {
                > :first-child {
                    margin-top: 0;
                }

                > :last-child {
                    margin-bottom: 0;
                }
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

            .tool-text,
            .tool-payload {
                margin: 0;
                padding: 0.5rem 0.6rem;
                border-radius: 4px;
                background: rgb(255 255 255 / 75%);
                color: color-mix(in oklab, var(--accent-color) 40%, black);
                font-family: var(--gs-mono-font-family, monospace);
                font-size: 0.8rem;
                line-height: 1.35;
                overflow-x: auto;
                white-space: pre-wrap;
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
        `,
    ];

    constructor() {
        super();

        /** @type {ChatMessage | undefined} */
        this.message = undefined;
        this.devMode = false;
        /** @type {string[] | undefined} */
        this.expandedToolResultKeys = undefined;
        /** @type {((value: string) => void) | undefined} */
        this.onSubmitMessage = undefined;
        /** @type {((disclosureKey: string) => void) | undefined} */
        this.onToggleToolResultPayload = undefined;
    }

    /**
     * @returns {import("lit").TemplateResult}
     */
    render() {
        const message = this.message;
        if (!message) {
            return nothing;
        }

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

    /**
     * @param {ChatMessage} message
     * @returns {import("lit").TemplateResult}
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
                                          this.onSubmitMessage?.(option.value)}
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
     * @returns {import("lit").TemplateResult}
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
     * @returns {import("lit").TemplateResult}
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
     * @returns {import("lit").TemplateResult}
     */
    #renderToolResult(message) {
        if (!this.devMode) {
            return nothing;
        }

        const disclosureKey = this.#getToolResultDisclosureKey(message);
        const hasStructuredContent = message.content !== undefined;
        const payloadExpanded =
            hasStructuredContent &&
            this.expandedToolResultKeys?.includes(disclosureKey);
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
                                      this.onToggleToolResultPayload?.(
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
     * @returns {import("lit").TemplateResult}
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
     * @returns {import("lit").TemplateResult}
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
     * @returns {import("lit").TemplateResult}
     */
    #renderUser(message) {
        return html`
            <article class="message user">
                <div class="message-text">${message.text ?? ""}</div>
            </article>
        `;
    }

    /**
     * @param {string | import("lit").TemplateResult} content
     * @returns {import("lit").TemplateResult}
     */
    #renderMarkdown(content) {
        if (typeof content === "string") {
            return html`<div class="markdown">${safeMarkdown(content)}</div>`;
        } else {
            return html`<div class="markdown">${content}</div>`;
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
}

customElements.define("gs-chat-message", ChatMessageElement);
