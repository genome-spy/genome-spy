import { css, html } from "lit";
import {
    BaseDialog,
    showDialog,
    showMessageDialog,
} from "@genome-spy/app/dialog";
import { getAgentState } from "../../agent/agentState.js";

export default class AgentVolatileContextDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        context: {},
        contextText: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
            section {
                width: min(90vw, 1000px);
            }

            .intro {
                color: #475569;
                margin-bottom: var(--gs-basic-spacing);
                max-width: 70em;
            }

            textarea {
                width: 100%;
                min-height: min(72vh, 760px);
                resize: vertical;
                font-family:
                    ui-monospace, SFMono-Regular, Monaco, Consolas,
                    "Liberation Mono", "Courier New", monospace;
                font-size: 12px;
                line-height: 1.45;
                box-sizing: border-box;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {unknown} */
        this.context = null;
        /** @type {string} */
        this.contextText = "";
        this.dialogTitle = "Volatile Context";
    }

    /**
     * @param {Map<string, unknown>} changed
     */
    willUpdate(changed) {
        super.willUpdate(changed);

        if (changed.has("context")) {
            this.contextText = this.context
                ? JSON.stringify(this.context, null, 2)
                : "";
        }
    }

    renderBody() {
        if (!this.contextText) {
            return html`<p class="intro">
                No volatile context is available yet.
            </p>`;
        }

        return html`
            <p class="intro">
                Current volatile context snapshot. Select text to copy it, or
                close the dialog when done.
            </p>
            <textarea readonly spellcheck="false" .value=${this.contextText}>
            </textarea>
        `;
    }
}

customElements.define(
    "gs-agent-volatile-context-dialog",
    /** @type {CustomElementConstructor} */ (
        /** @type {unknown} */ (AgentVolatileContextDialog)
    )
);

/**
 * @param {object} app
 * @returns {Promise<void>}
 */
export async function showAgentVolatileContextDialog(app) {
    const context = getAgentState(app).agentAdapter?.getAgentVolatileContext?.();
    if (!context) {
        await showMessageDialog("No volatile context is available yet.", {
            title: "Volatile Context",
            type: "info",
        });
        return;
    }

    await showDialog(
        "gs-agent-volatile-context-dialog",
        (/** @type {any} */ dialog) => {
            dialog.context = context;
        }
    );
}
