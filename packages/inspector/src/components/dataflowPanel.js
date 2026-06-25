import { LitElement, html, nothing } from "lit";
import { formatValue } from "./formatters.js";
import { inspectorPanelStyles } from "./sharedStyles.js";

/**
 * @typedef {import("@genome-spy/core/debug/dataflowDebugSnapshot.js").DataflowDebugSnapshot} DataflowDebugSnapshot
 * @typedef {import("@genome-spy/core/debug/dataflowDebugSnapshot.js").DataflowDebugNode} DataflowDebugNode
 */

export class GsInspectorDataflowPanel extends LitElement {
    static properties = {
        snapshot: { attribute: false },
        selectedFlowNodeId: { attribute: false },
    };

    static styles = inspectorPanelStyles;

    constructor() {
        super();
        /** @type {{ dataflow: DataflowDebugSnapshot }} */
        this.snapshot = {
            dataflow: {
                sourceIds: [],
                nodes: [],
                collectorCount: 0,
            },
        };
        /** @type {string | undefined} */
        this.selectedFlowNodeId = undefined;
    }

    render() {
        if (this.snapshot.dataflow.sourceIds.length === 0) {
            return html`
                <div class="single-panel">
                    <p class="empty">No dataflow has been built yet.</p>
                </div>
            `;
        }

        const selected = this.selectedFlowNodeId
            ? this.#getFlowNode(this.selectedFlowNodeId)
            : this.#getFlowNode(this.snapshot.dataflow.sourceIds[0]);

        return html`
            <div class="main">
                <div class="tree">
                    <p class="empty">
                        ${this.snapshot.dataflow.sourceIds.length} sources,
                        ${this.snapshot.dataflow.collectorCount} collectors
                    </p>
                    ${this.snapshot.dataflow.sourceIds.map((sourceId) =>
                        this.#renderFlowNode(this.#getFlowNode(sourceId), 0)
                    )}
                </div>
                <div class="details">
                    ${this.#renderFlowNodeDetails(selected)}
                </div>
            </div>
        `;
    }

    /**
     * @param {DataflowDebugNode} node
     * @param {number} depth
     * @returns {import("lit").TemplateResult}
     */
    #renderFlowNode(node, depth) {
        const selected = node.id === this.selectedFlowNodeId;
        const warning = node.disposed || !node.initialized;
        return html`
            <button
                class=${[
                    "node",
                    selected ? "selected" : "",
                    warning ? "warning" : "",
                ].join(" ")}
                style=${`padding-left: ${0.65 + depth * 1.1}rem`}
                @click=${() => this.#selectFlowNode(node.id)}
                @mouseenter=${() => this.#highlightView(node.viewId)}
                @mouseleave=${() => this.#highlightView(undefined)}
            >
                <span class="node-main">
                    ${node.childIds.length > 0 ? "v" : "-"} ${node.label}
                    ${node.completed
                        ? html`<span class="badge">done</span>`
                        : nothing}
                    ${node.disposed
                        ? html`<span class="badge">disposed</span>`
                        : nothing}
                    ${node.initialized
                        ? nothing
                        : html`<span class="badge">new</span>`}
                </span>
                <span class="node-meta">out ${node.count}</span>
            </button>
            ${node.childIds.map(
                /**
                 * @param {string} childId
                 * @returns {import("lit").TemplateResult}
                 */
                (childId) =>
                    this.#renderFlowNode(this.#getFlowNode(childId), depth + 1)
            )}
        `;
    }

    /**
     * @param {DataflowDebugNode} node
     * @returns {import("lit").TemplateResult}
     */
    #renderFlowNodeDetails(node) {
        return html`
            <h2>${node.label}</h2>
            <dl>
                <dt>id</dt>
                <dd>${node.id}</dd>
                <dt>out count</dt>
                <dd>${node.count}</dd>
                <dt>children</dt>
                <dd>${node.childIds.length}</dd>
                <dt>completed</dt>
                <dd>${String(node.completed)}</dd>
                <dt>initialized</dt>
                <dd>${String(node.initialized)}</dd>
                <dt>disposed</dt>
                <dd>${String(node.disposed)}</dd>
                <dt>view</dt>
                <dd>
                    ${node.viewId
                        ? html`<span
                              class="linked"
                              @click=${() => this.#selectView(node.viewId)}
                              >${node.viewPath}</span
                          >`
                        : "-"}
                </dd>
                <dt>domain-sensitive scales</dt>
                <dd>
                    ${node.domainSensitiveScaleChannels.length
                        ? node.domainSensitiveScaleChannels.join(", ")
                        : "-"}
                </dd>
            </dl>

            <h3>Params</h3>
            ${node.params
                ? html`<pre>${formatValue(node.params)}</pre>`
                : html`<p class="empty">No flow node parameters.</p>`}

            <h3>First Datum</h3>
            ${node.first
                ? html`<pre class="flow-first">${formatValue(node.first)}</pre>`
                : html`<p class="empty">
                      ${node.count > 0
                          ? "No datum preview is available."
                          : "No data was propagated."}
                  </p>`}
        `;
    }

    /**
     * @param {string} id
     * @returns {DataflowDebugNode}
     */
    #getFlowNode(id) {
        const node = this.snapshot.dataflow.nodes.find(
            (candidate) => candidate.id === id
        );
        if (!node) {
            throw new Error("Unknown inspector flow node: " + id);
        }
        return node;
    }

    /**
     * @param {string} flowNodeId
     */
    #selectFlowNode(flowNodeId) {
        this.selectedFlowNodeId = flowNodeId;
        this.dispatchEvent(
            new CustomEvent("select-flow-node", {
                detail: { flowNodeId },
                bubbles: true,
                composed: true,
            })
        );
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

    /**
     * @param {string | undefined} viewId
     */
    #highlightView(viewId) {
        this.dispatchEvent(
            new CustomEvent("highlight-view", {
                detail: { viewId },
                bubbles: true,
                composed: true,
            })
        );
    }
}

customElements.define("gs-inspector-dataflow-panel", GsInspectorDataflowPanel);
