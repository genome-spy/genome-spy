import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationTriangle,
    faInfoCircle,
    faRobot,
} from "@fortawesome/free-solid-svg-icons";
import { css, html, LitElement, nothing } from "lit";

/**
 * @typedef {import("./types.d.ts").AgentContext} AgentContext
 * @typedef {import("./types.d.ts").IntentProgram} IntentProgram
 * @typedef {import("./types.d.ts").IntentProgramExecutionResult} IntentProgramExecutionResult
 * @typedef {import("./types.d.ts").IntentProgramValidationResult} IntentProgramValidationResult
 * @typedef {import("./types.d.ts").PlanResponse} PlanResponse
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
 *     text?: string;
 *     lines?: string[];
 *     options?: ChatClarificationOption[];
 * }} ChatMessage
 *
 * @typedef {{
 *     viewTitle: string;
 *     viewType: string;
 *     sampleCount: number;
 *     attributeCount: number;
 *     actionCount: number;
 *     provenanceCount: number;
 *     paramCount: number;
 *     selectionSummaries: string[];
 * }} ChatContextSummary
 *
 * @typedef {{
 *     getAgentContext(): AgentContext;
 *     requestPlan(message: string, history?: string[]): Promise<{ response: PlanResponse, trace: Record<string, any> }>;
 *     validateIntentProgram(program: unknown): IntentProgramValidationResult;
 *     submitIntentProgram(program: IntentProgram): Promise<IntentProgramExecutionResult>;
 *     summarizeExecutionResult(result: IntentProgramExecutionResult): string;
 * }} AgentChatController
 */

const STATUS_LABELS = {
    idle: "Ready",
    thinking: "Thinking",
    executing: "Executing",
    clarification: "Need clarification",
    error: "Error",
};

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

    static styles = css`
        :host {
            display: block;
            box-sizing: border-box;
            height: 100%;
            min-height: 640px;
            color: #102033;
            font-family: var(
                --gs-font-family,
                Inter,
                ui-sans-serif,
                system-ui,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif
            );
        }

        .panel {
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: 640px;
            overflow: hidden;
            border: 1px solid #d6dde8;
            border-radius: 16px;
            background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
            box-shadow:
                0 18px 48px rgba(15, 23, 42, 0.12),
                0 2px 8px rgba(15, 23, 42, 0.05);
        }

        header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
            padding: 1rem 1rem 0.9rem;
            color: #ffffff;
            background: linear-gradient(135deg, #17243d 0%, #24436d 100%);
        }

        .header-main {
            display: grid;
            gap: 0.25rem;
            min-width: 0;
        }

        .title-row {
            display: flex;
            align-items: center;
            gap: 0.55rem;
            min-width: 0;
        }

        .title-row svg {
            width: 1em;
            height: 1em;
            flex: 0 0 auto;
        }

        .title {
            font-size: 1rem;
            font-weight: 700;
            letter-spacing: 0.01em;
        }

        .status {
            font-size: 0.78rem;
            color: rgba(255, 255, 255, 0.84);
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex: 0 0 auto;
        }

        .header-button,
        .composer button,
        .clarification-option {
            border: 0;
            border-radius: 999px;
            font: inherit;
            cursor: pointer;
            transition:
                transform 0.14s ease,
                background-color 0.14s ease,
                box-shadow 0.14s ease,
                opacity 0.14s ease;
        }

        .header-button {
            display: inline-flex;
            align-items: center;
            gap: 0.45rem;
            padding: 0.55rem 0.9rem;
            color: #102033;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 1px 0 rgba(255, 255, 255, 0.35) inset;
        }

        .header-button:hover:not(:disabled),
        .composer button:hover:not(:disabled),
        .clarification-option:hover:not(:disabled) {
            transform: translateY(-1px);
        }

        .header-button:disabled,
        .composer button:disabled,
        .clarification-option:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .body {
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            min-height: 0;
            flex: 1 1 auto;
        }

        .context {
            display: grid;
            gap: 0.75rem;
            padding: 0.95rem 1rem;
            background: #f5f8fc;
            border-bottom: 1px solid #e0e7f0;
        }

        .context-header {
            display: flex;
            align-items: center;
            gap: 0.45rem;
            font-size: 0.8rem;
            font-weight: 700;
            color: #31445f;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .context-header svg {
            width: 0.95em;
            height: 0.95em;
        }

        .context-grid {
            display: grid;
            gap: 0.75rem;
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .context-card {
            display: grid;
            gap: 0.35rem;
            min-width: 0;
        }

        .context-label {
            font-size: 0.74rem;
            font-weight: 700;
            color: #6a7685;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .context-value {
            font-size: 0.88rem;
            font-weight: 600;
            color: #18263d;
            word-break: break-word;
        }

        .context-note {
            font-size: 0.82rem;
            color: #516074;
            line-height: 1.4;
        }

        .transcript {
            display: flex;
            flex-direction: column;
            gap: 0.9rem;
            min-height: 0;
            overflow: auto;
            padding: 1rem;
        }

        .empty-state {
            display: grid;
            gap: 0.7rem;
            padding: 1rem;
            border: 1px dashed #c7d3e3;
            border-radius: 14px;
            background: #fbfdff;
            color: #47576b;
        }

        .empty-state strong {
            color: #18263d;
        }

        .empty-examples {
            display: grid;
            gap: 0.35rem;
            margin: 0;
            padding-left: 1.1rem;
        }

        .message {
            display: grid;
            gap: 0.45rem;
            max-width: min(88%, 40rem);
            padding: 0.9rem 1rem;
            border-radius: 18px;
            box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
        }

        .message.user {
            align-self: flex-end;
            border-bottom-right-radius: 6px;
            color: #fff;
            background: linear-gradient(135deg, #1b2b49 0%, #23406b 100%);
        }

        .message.assistant {
            align-self: flex-start;
            border: 1px solid #d9e2ee;
            border-bottom-left-radius: 6px;
            background: #eef4fb;
        }

        .message.plan {
            align-self: flex-start;
            border: 1px solid #f1d9a7;
            border-bottom-left-radius: 6px;
            background: #fff8eb;
        }

        .message.result {
            align-self: flex-start;
            border: 1px solid #cbe5d0;
            border-bottom-left-radius: 6px;
            background: #f1fbf4;
        }

        .message.clarification {
            align-self: flex-start;
            border: 1px solid #d9e2ee;
            border-bottom-left-radius: 6px;
            background: #f8fbfe;
        }

        .message.error {
            align-self: flex-start;
            border: 1px solid #f1c1c1;
            border-bottom-left-radius: 6px;
            background: #fff4f4;
        }

        .message-title {
            display: flex;
            align-items: center;
            gap: 0.45rem;
            font-size: 0.78rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .message-title svg {
            width: 0.95em;
            height: 0.95em;
            flex: 0 0 auto;
        }

        .message-text {
            line-height: 1.45;
            white-space: pre-wrap;
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
        }

        .clarification-option {
            padding: 0.55rem 0.85rem;
            background: #18263d;
            color: #fff;
        }

        .composer {
            display: grid;
            gap: 0.6rem;
            padding: 1rem;
            border-top: 1px solid #e0e7f0;
            background: rgba(255, 255, 255, 0.96);
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
            padding: 0.8rem 0.95rem;
            border: 1px solid #cfd9e7;
            border-radius: 14px;
            font: inherit;
            color: #102033;
            background: #fff;
            outline: none;
            box-sizing: border-box;
        }

        .composer textarea:focus {
            border-color: #7b98c2;
            box-shadow: 0 0 0 3px rgba(123, 152, 194, 0.18);
        }

        .composer button {
            padding: 0.7rem 1rem;
            background: #1b2b49;
            color: #fff;
            box-shadow: 0 10px 24px rgba(27, 43, 73, 0.18);
        }

        .composer-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            color: #607086;
            font-size: 0.8rem;
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
            color: #31445f;
        }

        .composer-status svg {
            width: 0.95em;
            height: 0.95em;
        }

        .muted {
            color: #66778c;
        }
    `;

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
        /** @type {{ title: string, lines: string[] } | null} */
        this.lastPlan = null;
        /** @type {string} */
        this.lastError = "";
        /** @type {ChatContextSummary | null} */
        this.contextSummary = null;

        this.#nextMessageId = 1;
    }

    connectedCallback() {
        super.connectedCallback();
        void this.#refreshContext();
    }

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
                            ${STATUS_LABELS[this.status] ?? this.status}
                            ${this.pendingRequest
                                ? html`&nbsp;·&nbsp;${this.pendingRequest
                                      .message}`
                                : nothing}
                        </div>
                    </div>

                    <div class="header-actions">
                        <button
                            class="header-button"
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
                    ${this.#renderContext()}
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
     * @returns {import("lit").TemplateResult}
     */
    #renderContext() {
        if (!this.contextSummary) {
            return html`
                <section class="context">
                    <div class="context-header">
                        ${icon(faInfoCircle).node[0]} Context
                    </div>
                    <div class="context-note">
                        Connect a controller to show the current view, selection
                        state, and provenance summary here.
                    </div>
                </section>
            `;
        }

        const summary = this.contextSummary;
        return html`
            <section class="context">
                <div class="context-header">
                    ${icon(faInfoCircle).node[0]} Context
                </div>
                <div class="context-grid">
                    <div class="context-card">
                        <div class="context-label">View</div>
                        <div class="context-value">${summary.viewTitle}</div>
                        <div class="context-note">
                            ${summary.viewType} · ${summary.sampleCount} samples
                            · ${summary.attributeCount} attributes
                        </div>
                    </div>
                    <div class="context-card">
                        <div class="context-label">Selection</div>
                        <div class="context-value">
                            ${summary.selectionSummaries.length > 0
                                ? summary.selectionSummaries[0]
                                : "No active selection"}
                        </div>
                        <div class="context-note">
                            ${summary.paramCount} bookmarkable params ·
                            ${summary.actionCount} available actions ·
                            ${summary.provenanceCount} provenance actions
                        </div>
                    </div>
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
                    <div class="message-text">${message.text ?? ""}</div>
                    <div class="clarification-options">
                        ${message.options?.map(
                            (option) => html`
                                <button
                                    class="clarification-option"
                                    type="button"
                                    @click=${() =>
                                        this.#submitMessage(option.label)}
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
                        ? html`<div class="message-text">${message.text}</div>`
                        : nothing}
                    ${message.lines?.length
                        ? html`
                              <ul class="message-lines">
                                  ${message.lines.map(
                                      (line) => html`<li>${line}</li>`
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
                                      (line) => html`<li>${line}</li>`
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
                    <div class="message-title">
                        ${icon(faRobot).node[0]} Assistant
                    </div>
                    <div class="message-text">${message.text ?? ""}</div>
                </article>
            `;
        } else {
            return html`
                <article class="message user">
                    <div class="message-title">You</div>
                    <div class="message-text">${message.text ?? ""}</div>
                </article>
            `;
        }
    }

    /**
     * @param {InputEvent} event
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
     * @param {SubmitEvent} event
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
            .map((message) => message.text ?? "")
            .filter(Boolean)
            .slice(-8);
    }

    /**
     * @param {PlanResponse} response
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
            this.#appendMessage({
                kind: "clarification",
                text: response.message,
                options: response.options?.map((option) => ({
                    value: option.value,
                    label: option.label,
                    description: option.description,
                })),
            });
            this.status = "clarification";
        } else if (response.type === "intent_program") {
            this.lastPlan = {
                title: "Proposed actions",
                lines: response.program.steps.map(
                    (step) => step.actionType + this.#formatPlanPayload(step)
                ),
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
            const summary = this.controller.summarizeExecutionResult(result);
            this.#appendMessage({
                kind: "result",
                text: summary.split("\n")[0] ?? "Executed actions.",
                lines: summary.split("\n").slice(1),
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
     * @param {{ actionType: string, payload: Record<string, any> }} step
     * @returns {string}
     */
    #formatPlanPayload(step) {
        if (step.actionType === "sortBy" && step.payload.attribute) {
            return " on " + this.#formatAttribute(step.payload.attribute);
        } else if (
            step.actionType === "filterByNominal" &&
            step.payload.attribute
        ) {
            return " on " + this.#formatAttribute(step.payload.attribute);
        } else if (
            step.actionType === "filterByQuantitative" &&
            step.payload.attribute
        ) {
            return " on " + this.#formatAttribute(step.payload.attribute);
        } else {
            return "";
        }
    }

    /**
     * @param {unknown} attribute
     * @returns {string}
     */
    #formatAttribute(attribute) {
        if (
            attribute &&
            typeof attribute === "object" &&
            "specifier" in attribute
        ) {
            return String(
                /** @type {{ specifier: unknown }} */ (attribute).specifier
            );
        } else {
            return "attribute";
        }
    }

    /**
     * @param {ChatMessage} message
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
        return {
            viewTitle: context.view.title,
            viewType: context.view.type,
            sampleCount: context.view.sampleCount,
            attributeCount: context.attributes.length,
            actionCount: context.actionSummaries.length,
            provenanceCount: context.provenance.length,
            paramCount: context.params.length,
            selectionSummaries: context.params.map((param) => {
                const selector = param.selector;
                const selectorText =
                    selector &&
                    typeof selector === "object" &&
                    "scope" in selector
                        ? selector.scope.join("/") || "root"
                        : "root";
                return (
                    selectorText + ": " + this.#formatContextValue(param.value)
                );
            }),
        };
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
}

customElements.define("gs-agent-chat-panel", AgentChatPanel);
