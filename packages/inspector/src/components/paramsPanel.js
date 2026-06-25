import { LitElement, html } from "lit";
import { formatValue } from "./formatters.js";
import { inspectorPanelStyles } from "./sharedStyles.js";

/**
 * @typedef {import("@genome-spy/core/debug/paramDebugSnapshot.js").ParamDebugSnapshot} ParamDebugSnapshot
 * @typedef {import("@genome-spy/core/debug/paramDebugSnapshot.js").ParamDebugNode} ParamDebugNode
 */

export class GsInspectorParamsPanel extends LitElement {
    static properties = {
        snapshot: { attribute: false },
    };

    static styles = inspectorPanelStyles;

    constructor() {
        super();
        /** @type {{ params: ParamDebugSnapshot }} */
        this.snapshot = {
            params: {
                scopes: [],
            },
        };
    }

    render() {
        const scopes = this.snapshot.params.scopes.filter(
            (scope) => scope.params.length > 0
        );
        if (scopes.length === 0) {
            return html`
                <div class="single-panel">
                    <p class="empty">No params.</p>
                </div>
            `;
        }

        return html`
            <div class="single-panel">
                <h2>Params</h2>
                ${scopes.map(
                    (scope) => html`
                        <h3>
                            <span
                                class="linked"
                                @click=${() => this.#selectView(scope.viewId)}
                                >${scope.viewPath}</span
                            >
                            <span class="muted">${scope.scopeId}</span>
                        </h3>
                        ${renderParamTable(scope.params)}
                    `
                )}
            </div>
        `;
    }

    /**
     * @param {string} viewId
     */
    #selectView(viewId) {
        this.dispatchEvent(
            new CustomEvent("select-view", {
                detail: { viewId },
                bubbles: true,
                composed: true,
            })
        );
    }
}

/**
 * @param {ParamDebugNode[]} params
 * @returns {import("lit").TemplateResult}
 */
export function renderParamTable(params) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>name</th>
                    <th>kind</th>
                    <th>writable</th>
                    <th>value</th>
                    <th>config</th>
                </tr>
            </thead>
            <tbody>
                ${params.map(
                    (param) => html`
                        <tr>
                            <td>${param.name}</td>
                            <td>${param.kind}</td>
                            <td>${String(param.writable)}</td>
                            <td>${formatValue(param.value)}</td>
                            <td>
                                ${param.config
                                    ? formatValue(param.config)
                                    : "-"}
                            </td>
                        </tr>
                    `
                )}
            </tbody>
        </table>
    `;
}

customElements.define("gs-inspector-params-panel", GsInspectorParamsPanel);
