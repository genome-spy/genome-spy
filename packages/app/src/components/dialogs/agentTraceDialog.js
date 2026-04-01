import { css, html, nothing } from "lit";
import BaseDialog from "../generic/baseDialog.js";

function formatValue(value) {
    if (value === undefined || value === null || value === "") {
        return "n/a";
    }

    return String(value);
}

function formatMilliseconds(value) {
    if (typeof value !== "number") {
        return formatValue(value);
    }

    return value.toFixed(1) + " ms";
}

export default class AgentTraceDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        app: { type: Object },
        traces: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
            section {
                min-width: min(90vw, 760px);
                max-width: 760px;
            }

            .trace-list {
                display: flex;
                flex-direction: column;
                gap: var(--gs-basic-spacing, 10px);
            }

            .empty {
                color: #666;
                max-width: 40em;
            }

            details {
                border: 1px solid #d9d9d9;
                border-radius: 4px;
                background: #fafafa;
            }

            summary {
                cursor: pointer;
                list-style: none;
                padding: var(--gs-basic-spacing, 10px);
                font-weight: 600;
                display: flex;
                justify-content: space-between;
                gap: var(--gs-basic-spacing, 10px);
            }

            summary::-webkit-details-marker {
                display: none;
            }

            .summary-label {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .summary-meta {
                color: #666;
                font-size: 12px;
                font-weight: 400;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                background: white;
            }

            tbody tr:nth-child(odd) {
                background: #f6f8fb;
            }

            th,
            td {
                padding: 8px 10px;
                text-align: left;
                vertical-align: top;
                border-top: 1px solid #e2e8f0;
            }

            th {
                width: 210px;
                font-weight: 600;
                color: #334155;
            }

            code {
                font-family:
                    ui-monospace, SFMono-Regular, Monaco, Consolas,
                    "Liberation Mono", "Courier New", monospace;
                font-size: 12px;
                word-break: break-word;
            }
        `,
    ];

    constructor() {
        super();
        this.dialogTitle = "Agent Trace";
        this.app = undefined;
        this.traces = [];

        this.#handleTraceAdded = this.#handleTraceAdded.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        this.#refreshTraces();
        window.addEventListener(
            "genomespy-agent-trace",
            this.#handleTraceAdded
        );
    }

    disconnectedCallback() {
        window.removeEventListener(
            "genomespy-agent-trace",
            this.#handleTraceAdded
        );
        super.disconnectedCallback();
    }

    #handleTraceAdded() {
        this.#refreshTraces();
    }

    #refreshTraces() {
        this.traces = this.app ? [...this.app.getAgentTraces()] : [];
    }

    renderButtons() {
        const buttons = [];

        if (this.traces.length) {
            buttons.push(
                this.makeButton(
                    "Clear",
                    () => {
                        this.app.clearAgentTraces();
                        this.#refreshTraces();
                        return true;
                    },
                    { preventMouseDown: true }
                )
            );
        }

        buttons.push(this.makeCloseButton());
        return buttons;
    }

    renderBody() {
        if (!this.traces.length) {
            return html`<p class="empty">
                No agent traces yet. Run a local agent prompt and reopen this
                panel, or keep it open while you test prompts.
            </p>`;
        }

        return html`<div class="trace-list">
            ${this.traces.map((trace, index) =>
                this.#renderTrace(trace, index)
            )}
        </div>`;
    }

    #renderTrace(trace, index) {
        return html`<details ?open=${index === 0}>
            <summary>
                <span class="summary-label">
                    <span>${trace.message}</span>
                    <span class="summary-meta">
                        ${trace.timestamp ?? "n/a"} ·
                        ${trace.responseType ?? "n/a"}
                    </span>
                </span>
                <span>${formatMilliseconds(trace.totalMs)}</span>
            </summary>
            <table>
                <tbody>
                    ${this.#renderRow(
                        "Context build",
                        formatMilliseconds(trace.contextBuildMs)
                    )}
                    ${this.#renderRow(
                        "HTTP request",
                        formatMilliseconds(trace.requestMs)
                    )}
                    ${this.#renderRow(
                        "Response parse",
                        formatMilliseconds(trace.responseParseMs)
                    )}
                    ${this.#renderRow(
                        "Validation",
                        formatMilliseconds(trace.validationMs)
                    )}
                    ${this.#renderRow(
                        "Preview build",
                        formatMilliseconds(trace.previewBuildMs)
                    )}
                    ${this.#renderRow(
                        "Confirmation wait",
                        formatMilliseconds(trace.confirmationMs)
                    )}
                    ${this.#renderRow(
                        "Execution",
                        formatMilliseconds(trace.executionMs)
                    )}
                    ${this.#renderRow(
                        "Total",
                        formatMilliseconds(trace.totalMs)
                    )}
                    ${this.#renderRow(
                        "Server-Timing",
                        formatValue(trace.serverTiming)
                    )}
                    ${this.#renderRow(
                        "Agent server total",
                        formatValue(trace.agentServerTotalMs)
                    )}
                    ${this.#renderRow(
                        "Executed actions",
                        formatValue(trace.executedActions)
                    )}
                    ${this.#renderRow("Executed", formatValue(trace.executed))}
                    ${this.#renderRow(
                        "Error",
                        trace.error ? html`<code>${trace.error}</code>` : "n/a"
                    )}
                </tbody>
            </table>
        </details>`;
    }

    #renderRow(label, value) {
        return html`<tr>
            <th>${label}</th>
            <td>${value ?? nothing}</td>
        </tr>`;
    }
}

customElements.define("gs-agent-trace-dialog", AgentTraceDialog);
