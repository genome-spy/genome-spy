import { css, html, LitElement, nothing } from "lit";

/**
 * @typedef {{
 *     streamStatus: "idle" | "working" | "streaming" | "final" | "error";
 *     pendingResponsePlaceholder: string;
 *     streamDraftText: string;
 *     streamReasoningText: string;
 * }} ChatStreamState
 */

export default class ChatStreamElement extends LitElement {
    static properties = {
        streamStatus: { type: String },
        pendingResponsePlaceholder: { type: String },
        streamDraftText: { type: String },
        streamReasoningText: { type: String },
    };

    static styles = css`
        :host {
            display: block;
            width: 100%;
            box-sizing: border-box;
            align-self: flex-start;
            max-width: min(84%, 44rem);
        }

        .message {
            display: grid;
            gap: 0.35rem;
            width: 100%;
            box-sizing: border-box;
            padding: 0.25rem 0.15rem;
            border: none;
            background: transparent;
            border-left-width: 0;
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
            animation: chat-stream-spin 0.8s linear infinite;
            flex: 0 0 auto;
        }

        @keyframes chat-stream-spin {
            to {
                transform: rotate(360deg);
            }
        }

        .streaming-draft {
            white-space: pre-wrap;
            color: #222;
        }

        .streaming-error {
            color: #b55454;
            font-style: italic;
        }

        .streaming-reasoning {
            white-space: pre-wrap;
            color: #666;
            font-size: 0.88rem;
        }
    `;

    constructor() {
        super();

        /** @type {ChatStreamState["streamStatus"]} */
        this.streamStatus = "idle";
        /** @type {string} */
        this.pendingResponsePlaceholder = "";
        /** @type {string} */
        this.streamDraftText = "";
        /** @type {string} */
        this.streamReasoningText = "";
    }

    /**
     * @returns {import("lit").TemplateResult | typeof nothing}
     */
    render() {
        if (
            this.streamStatus === "idle" &&
            !this.pendingResponsePlaceholder &&
            this.streamDraftText.trimStart().length === 0
        ) {
            return nothing;
        }

        const draftText = this.streamDraftText.trimStart();
        const reasoningText = this.streamReasoningText.trimStart();
        const hasVisibleDraft = draftText.length > 0;
        if (this.streamStatus === "final" && !hasVisibleDraft) {
            return nothing;
        }

        if (this.streamStatus === "error" && !hasVisibleDraft) {
            return html`
                <article class="message assistant streaming">
                    <div class="assistant-body">
                        <div class="streaming-error">Response failed.</div>
                        ${reasoningText
                            ? html`<div class="streaming-reasoning">
                                  ${reasoningText}
                              </div>`
                            : nothing}
                    </div>
                </article>
            `;
        }

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
                          <span>${this.pendingResponsePlaceholder}</span>
                      </div>`}
            </article>
        `;
    }
}

customElements.define("gs-chat-stream", ChatStreamElement);
