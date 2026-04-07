import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationTriangle,
    faInfoCircle,
    faRobot,
} from "@fortawesome/free-solid-svg-icons";
import { css, html, LitElement, nothing } from "lit";
import { faStyles, formStyles } from "../components/generic/componentStyles.js";
import safeMarkdown from "../utils/safeMarkdown.js";
import templateResultToString from "../utils/templateResultToString.js";

/**
 * @typedef {import("./types.d.ts").AgentContext} AgentContext
 * @typedef {import("./types.d.ts").IntentProgram} IntentProgram
 * @typedef {import("./types.d.ts").IntentProgramExecutionResult} IntentProgramExecutionResult
 * @typedef {import("./types.d.ts").IntentProgramValidationResult} IntentProgramValidationResult
 * @typedef {import("./types.d.ts").IntentProgramSummaryLine} IntentProgramSummaryLine
 * @typedef {import("./types.d.ts").PlanResponse} PlanResponse
 * @typedef {PlanResponse | {
 *     type: "clarify";
 *     message: string | import("lit").TemplateResult;
 *     options?: ChatClarificationOption[];
 * }} ChatPlannerResponse
 *
 * @typedef {{
 *     value: string;
 *     label: string;
 *     description?: string;
 * }} ChatClarificationOption
 *
 * @typedef {{
 *     id: number;
 *     kind: "user" | "assistant" | "clarification" | "plan" | "result" | "error";
 *     title?: string;
 *     text?: string | import("lit").TemplateResult;
 *     lines?: IntentProgramSummaryLine[];
 *     options?: ChatClarificationOption[];
 * }} ChatMessage
 *
 * @typedef {{
 *     selectionSummaries: string[];
 * }} ChatContextSummary
 *
 * @typedef {{
 *     getAgentContext(): AgentContext;
 *     requestPlan(message: string, history?: string[]): Promise<{ response: ChatPlannerResponse, trace: Record<string, any> }>;
 *     validateIntentProgram(program: unknown): IntentProgramValidationResult;
 *     submitIntentProgram(program: IntentProgram): Promise<IntentProgramExecutionResult>;
 *     summarizeExecutionResult(result: IntentProgramExecutionResult): string;
 *     summarizeIntentProgram(program: IntentProgram): IntentProgramSummaryLine[];
 * }} AgentChatController
 */
export default class AgentChatPanel extends LitElement {
    static properties = {
        controller: { attribute: false },
        panelTitle: { type: String },
        status: { state: true },
        draft: { state: true },
        messages: { state: true },
        pendingRequest: { state: true },
        lastPlan: { state: true },
        lastError: { state: true },
        contextSummary: { state: true },
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

            .selection-summary {
                margin: var(--gs-basic-spacing, 10px);
                margin-bottom: 0;
            }

            .selection-summary-title {
                display: flex;
                align-items: center;
                gap: 0.45rem;
                font-weight: 700;
                margin-bottom: 0.4rem;
            }

            .selection-summary-title svg {
                width: 0.95em;
                height: 0.95em;
            }

            .selection-summary-list {
                margin: 0;
                padding-left: 1.2rem;
            }

            .selection-summary-list li + li {
                margin-top: 0.25rem;
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

            .composer-status {
                flex: 0 0 auto;
                display: inline-flex;
                align-items: center;
                gap: 0.4rem;
                font-weight: 600;
                color: #444;
            }

            .composer-status svg {
                width: 0.95em;
                height: 0.95em;
            }

            .muted {
                color: #666;
            }
        `,
    ];

    constructor() {
        super();

        /** @type {AgentChatController | undefined} */
        this.controller = undefined;
        this.panelTitle = "Agent Chat";
        this.status = "idle";
        this.draft = "";
        /** @type {ChatMessage[]} */
        this.messages = [];
        /** @type {{ message: string } | null} */
        this.pendingRequest = null;
        /** @type {{ title: string, lines: IntentProgramSummaryLine[] } | null} */
        this.lastPlan = null;
        /** @type {string} */
        this.lastError = "";
        /** @type {ChatContextSummary | null} */
        this.contextSummary = null;
    }

    /** @type {number} */
    #nextMessageId = 1;

    connectedCallback() {
        super.connectedCallback();
        void this.#refreshContext();
    }

    /**
     * @param {Map<string, unknown>} changedProperties
     */
    updated(changedProperties) {
        if (changedProperties.has("controller")) {
            void this.#refreshContext();
        }
    }

    render() {
        return html`
            <section class="panel">
                <header>
                    <div class="header-main">
                        <div class="title-row">
                            ${icon(faRobot).node[0]}
                            <div class="title">${this.panelTitle}</div>
                        </div>
                        <div class="status">
                            ${this.#getStatusLabel()}
                            ${this.pendingRequest
                                ? html`&nbsp;·&nbsp;${this.pendingRequest
                                      .message}`
                                : nothing}
                        </div>
                    </div>

                    <div class="header-actions">
                        <button
                            class="btn"
                            type="button"
                            title="Refresh context"
                            ?disabled=${!this.controller}
                            @click=${() => {
                                void this.#refreshContext();
                            }}
                        >
                            ${icon(faInfoCircle).node[0]} Context
                        </button>
                    </div>
                </header>

                <div class="body">
                    ${this.#renderSelectionSummary()}
                    <section class="transcript">
                        ${this.messages.length === 0
                            ? this.#renderEmptyState()
                            : this.messages.map((message) =>
                                  this.#renderMessage(message)
                              )}
                    </section>

                    <form class="composer" @submit=${this.#handleSubmit}>
                        <div class="composer-row">
                            <textarea
                                .value=${this.draft}
                                placeholder="Ask the agent about the current visualization or request an action."
                                ?disabled=${!this.controller ||
                                this.status === "executing"}
                                @input=${this.#handleDraftInput}
                                @keydown=${this.#handleComposerKeyDown}
                            ></textarea>
                            <button
                                type="submit"
                                ?disabled=${!this.controller ||
                                this.pendingRequest !== null ||
                                this.draft.trim().length === 0}
                                class="btn btn-primary"
                            >
                                Send
                            </button>
                        </div>

                        <div class="composer-footer">
                            <div class="composer-hint">
                                Shift+Enter inserts a new line.
                                ${this.lastError
                                    ? html`<span class="muted">
                                          Last error: ${this.lastError}</span
                                      >`
                                    : nothing}
                            </div>
                            <div class="composer-status">
                                ${this.status === "thinking" ||
                                this.status === "executing"
                                    ? html`${icon(faRobot).node[0]} Working`
                                    : html`${icon(faInfoCircle).node[0]} Idle`}
                            </div>
                        </div>
                    </form>
                </div>
            </section>
        `;
    }

    /**
     * @returns {import("lit").TemplateResult | typeof nothing}
     */
    #renderSelectionSummary() {
        if (
            !this.contextSummary ||
            this.contextSummary.selectionSummaries.length === 0
        ) {
            return nothing;
        }

        return html`
            <section class="selection-summary gs-alert info">
                <div class="selection-summary-title">
                    ${icon(faInfoCircle).node[0]} Active selections
                </div>
                <ul class="selection-summary-list">
                    ${this.contextSummary.selectionSummaries.map(
                        (summary) => html`<li>${summary}</li>`
                    )}
                </ul>
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
                    <div class="message-text">${message.text ?? ""}</div>
                    <div class="clarification-options">
                        ${message.options?.map(
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
                    </div>
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
                </article>
            `;
        } else if (message.kind === "result") {
            return html`
                <article class="message result">
                    <div class="message-title">
                        ${icon(faInfoCircle).node[0]} Execution result
                    </div>
                    ${message.text
                        ? html`<div class="message-text">${message.text}</div>`
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
        if (!trimmed || this.pendingRequest) {
            return;
        }

        if (!this.controller) {
            this.#appendMessage({
                kind: "error",
                text: "No agent controller is connected.",
            });
            this.lastError = "No agent controller is connected.";
            this.status = "error";
            return;
        }

        this.#appendMessage({
            kind: "user",
            text: trimmed,
        });

        this.draft = "";
        this.pendingRequest = { message: trimmed };
        this.status = "thinking";
        this.lastError = "";

        try {
            const history = this.#buildHistory();
            const { response } = await this.controller.requestPlan(
                trimmed,
                history
            );
            await this.#handleResponse(response);
        } catch (error) {
            const message = String(error);
            this.#appendMessage({
                kind: "error",
                text: message,
            });
            this.lastError = message;
            this.status = "error";
        } finally {
            this.pendingRequest = null;
        }
    }

    /**
     * @returns {string[]}
     */
    #buildHistory() {
        return this.messages
            .filter(
                (message) =>
                    message.kind === "user" || message.kind === "assistant"
            )
            .map((message) =>
                typeof message.text === "string"
                    ? message.text
                    : message.text
                      ? templateResultToString(message.text)
                      : ""
            )
            .filter(Boolean)
            .slice(-8);
    }

    /**
     * @param {ChatPlannerResponse} response
     * @returns {Promise<void>}
     */
    async #handleResponse(response) {
        if (response.type === "answer") {
            this.#appendMessage({
                kind: "assistant",
                text: response.message,
            });
            this.status = "idle";
        } else if (response.type === "clarify") {
            const options =
                "options" in response ? (response.options ?? []) : [];
            this.#appendMessage({
                kind: "clarification",
                text: response.message,
                options: options.map((option) => ({
                    value: option.value,
                    label: option.label,
                    description: option.description,
                })),
            });
            this.status = "clarification";
        } else if (response.type === "intent_program") {
            const planLines = this.controller.summarizeIntentProgram(
                response.program
            );
            this.lastPlan = {
                title: "Proposed actions",
                lines: planLines,
            };

            this.#appendMessage({
                kind: "plan",
                text:
                    response.program.rationale ??
                    "The agent proposed an action plan.",
                lines: this.lastPlan.lines,
            });

            this.status = "executing";
            const validation = this.controller.validateIntentProgram(
                response.program
            );
            if (!validation.ok || !validation.program) {
                const validationMessage = validation.errors.join("\n");
                this.#appendMessage({
                    kind: "error",
                    text: validationMessage,
                });
                this.lastError = validationMessage;
                this.status = "error";
                return;
            }

            const result = await this.controller.submitIntentProgram(
                validation.program
            );
            this.#appendMessage({
                kind: "result",
                text:
                    "Executed " +
                    result.executedActions +
                    " action" +
                    (result.executedActions === 1 ? "" : "s") +
                    ".",
                lines: result.summaries,
            });
            this.status = "idle";
        } else if (response.type === "view_workflow") {
            this.#appendMessage({
                kind: "assistant",
                text: "The planner returned a structured view workflow. That path is not wired into the chat panel draft yet.",
            });
            this.status = "idle";
        } else if (response.type === "agent_program") {
            this.#appendMessage({
                kind: "assistant",
                text: "The planner returned an agent program. That path is not wired into the chat panel draft yet.",
            });
            this.status = "idle";
        } else {
            const exhaustiveCheck = /** @type {never} */ (response);
            this.#appendMessage({
                kind: "error",
                text:
                    "Unsupported planner response: " + String(exhaustiveCheck),
            });
            this.status = "error";
        }
    }

    /**
     * @param {Omit<ChatMessage, "id">} message
     */
    #appendMessage(message) {
        this.messages = [
            ...this.messages,
            {
                id: this.#nextMessageId++,
                ...message,
            },
        ];
    }

    /**
     * @param {AgentContext} context
     * @returns {ChatContextSummary}
     */
    #summarizeContext(context) {
        /** @type {string[]} */
        const selectionSummaries = [];
        this.#collectSelectionSummaries(
            context.viewTree.root,
            selectionSummaries
        );

        return {
            selectionSummaries,
        };
    }

    /**
     * @param {import("./types.d.ts").AgentViewNode} node
     * @param {string[]} selectionSummaries
     */
    #collectSelectionSummaries(node, selectionSummaries) {
        if (node.selectionDeclarations) {
            for (const selection of node.selectionDeclarations) {
                const summary = this.#formatSelectionSummary(selection);
                if (summary) {
                    selectionSummaries.push(summary);
                }
            }
        }

        if (node.children) {
            for (const child of node.children) {
                this.#collectSelectionSummaries(child, selectionSummaries);
            }
        }
    }

    /**
     * @param {import("./types.d.ts").AgentSelectionDeclaration} selection
     * @returns {string}
     */
    #formatSelectionSummary(selection) {
        if (selection.value === null || selection.value === undefined) {
            return "";
        }

        const selector = selection.selector;
        const selectorLabel =
            selection.label ||
            (selector &&
            typeof selector === "object" &&
            "param" in selector &&
            selector.param
                ? String(selector.param)
                : "selection");

        return selectorLabel + ": " + this.#formatContextValue(selection.value);
    }

    /**
     * @param {unknown} value
     * @returns {string}
     */
    #formatContextValue(value) {
        if (typeof value === "string") {
            return value;
        } else if (
            value === null ||
            value === undefined ||
            typeof value === "number" ||
            typeof value === "boolean"
        ) {
            return String(value);
        } else {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
    }

    async #refreshContext() {
        if (!this.controller) {
            this.contextSummary = null;
            return;
        }

        try {
            const context = this.controller.getAgentContext();
            this.contextSummary = this.#summarizeContext(context);
        } catch {
            this.contextSummary = null;
        }
    }

    /**
     * @returns {string}
     */
    #getStatusLabel() {
        switch (this.status) {
            case "idle":
                return "Ready";
            case "thinking":
                return "Thinking";
            case "executing":
                return "Executing";
            case "clarification":
                return "Need clarification";
            case "error":
                return "Error";
            default:
                return this.status;
        }
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
        panel.controller = app.agentAdapter;
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
