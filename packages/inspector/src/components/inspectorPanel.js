import { LitElement, html, nothing } from "lit";
import {
    formatFlowNodeState,
    formatRecord,
    formatValue,
} from "./formatters.js";
import { inspectorPanelStyles } from "./sharedStyles.js";

/**
 * @typedef {import("@genome-spy/core/debug/viewDebugSnapshot.js").ViewDebugNode} ViewDebugNode
 * @typedef {import("@genome-spy/core/debug/dataflowDebugSnapshot.js").DataflowDebugNode} DataflowDebugNode
 * @typedef {import("@genome-spy/core/debug/paramDebugSnapshot.js").ParamScopeDebugNode} ParamScopeDebugNode
 * @typedef {import("@genome-spy/core/debug/paramDebugSnapshot.js").ParamDebugNode} ParamDebugNode
 * @typedef {import("@genome-spy/core/debug/markDebugSnapshot.js").MarkDebugNode} MarkDebugNode
 */

export class GsInspectorPanel extends LitElement {
    static properties = {
        session: { attribute: false },
        snapshot: { state: true },
        selectedViewId: { state: true },
        selectedFlowNodeId: { state: true },
        activePanel: { state: true },
    };

    static styles = inspectorPanelStyles;

    constructor() {
        super();
        /** @type {import("../inspectorSession.js").default | undefined} */
        this.session = undefined;
        this.snapshot = {
            rootId: undefined,
            nodes: [],
            resolutions: {
                scales: [],
                axes: [],
                legends: [],
            },
            dataflow: {
                sourceIds: [],
                nodes: [],
                collectorCount: 0,
            },
            params: {
                scopes: [],
            },
            marks: {
                marks: [],
            },
        };
        this.selectedViewId = undefined;
        this.selectedFlowNodeId = undefined;
        this.activePanel = "elements";
    }

    connectedCallback() {
        super.connectedCallback();
        this.#connectSession();
    }

    disconnectedCallback() {
        this.#disconnectSession();
        super.disconnectedCallback();
    }

    /**
     * @param {Map<string, any>} changed
     */
    updated(changed) {
        if (changed.has("session")) {
            this.#disconnectSession();
            this.#connectSession();
        }
    }

    /** @type {(() => void) | undefined} */
    #disconnect = undefined;

    #connectSession() {
        if (!this.session || this.#disconnect) {
            return;
        }

        const onSnapshot = () => {
            this.snapshot = this.session.snapshot;
            if (
                this.selectedViewId &&
                !this.snapshot.nodes.some(
                    (node) => node.id === this.selectedViewId
                )
            ) {
                this.selectedViewId = this.snapshot.rootId;
            } else {
                this.selectedViewId ??= this.snapshot.rootId;
            }
            if (
                this.selectedFlowNodeId &&
                !this.snapshot.dataflow.nodes.some(
                    (node) => node.id === this.selectedFlowNodeId
                )
            ) {
                this.selectedFlowNodeId = this.snapshot.dataflow.sourceIds[0];
            } else {
                this.selectedFlowNodeId ??= this.snapshot.dataflow.sourceIds[0];
            }
        };

        this.session.addEventListener("snapshot", onSnapshot);
        this.#disconnect = () => {
            this.session?.removeEventListener("snapshot", onSnapshot);
            this.#disconnect = undefined;
        };
        this.#refresh();
    }

    #disconnectSession() {
        this.#disconnect?.();
    }

    render() {
        const root = this.#getRootNode();
        const selected = this.#getSelectedNode();

        return html`
            <div class="shell">
                <div class="toolbar">
                    <strong class="toolbar-title">Inspector</strong>
                    <span class="panel-tabs">
                        ${this.#renderPanelTab("elements", "Elements")}
                        ${this.#renderPanelTab("resolutions", "Resolutions")}
                        ${this.#renderPanelTab("dataflow", "Dataflow")}
                        ${this.#renderPanelTab("params", "Params")}
                    </span>
                    <button @click=${() => this.#refresh()}>Refresh</button>
                    <button
                        class="close-button"
                        title="Close inspector"
                        aria-label="Close inspector"
                        @click=${() => this.#close()}
                    >
                        x
                    </button>
                </div>
                ${this.#renderActivePanel(root, selected)}
            </div>
        `;
    }

    #close() {
        this.dispatchEvent(
            new CustomEvent("close", {
                bubbles: true,
                composed: true,
            })
        );
    }

    /**
     * @param {string} panel
     * @param {string} label
     * @returns {import("lit").TemplateResult}
     */
    #renderPanelTab(panel, label) {
        return html`
            <button
                class=${this.activePanel === panel
                    ? "panel-tab selected"
                    : "panel-tab"}
                @click=${() => {
                    this.activePanel = panel;
                }}
            >
                ${label}
            </button>
        `;
    }

    /**
     * @param {ViewDebugNode | undefined} root
     * @param {ViewDebugNode | undefined} selected
     * @returns {import("lit").TemplateResult}
     */
    #renderActivePanel(root, selected) {
        if (this.activePanel === "dataflow") {
            return this.#renderDataflowPanel();
        }

        if (this.activePanel === "params") {
            return this.#renderParamsPanel();
        }

        if (this.activePanel === "resolutions") {
            return html`
                <div class="main">
                    ${this.#renderHierarchyPane(root)}
                    <div class="details">${this.#renderResolutionPanel()}</div>
                </div>
            `;
        }

        return html`
            <div class="main">
                ${this.#renderHierarchyPane(root)}
                <div class="details">
                    ${selected
                        ? this.#renderDetails(selected)
                        : html`<div class="empty">No view selected.</div>`}
                </div>
            </div>
        `;
    }

    /**
     * @param {ViewDebugNode | undefined} root
     * @returns {import("lit").TemplateResult}
     */
    #renderHierarchyPane(root) {
        return html`
            <div class="tree">
                <div class="tree-controls">
                    <label>
                        <input
                            type="checkbox"
                            .checked=${this.session?.includeChrome ?? false}
                            @change=${(/** @type {Event} */ event) => {
                                const input = /** @type {HTMLInputElement} */ (
                                    event.target
                                );
                                void this.session?.setIncludeChrome(
                                    input.checked
                                );
                            }}
                        />
                        All chrome
                    </label>
                </div>
                ${root
                    ? this.#renderNode(root, 0)
                    : html`<div class="empty">
                          Launch the app to inspect the hierarchy.
                      </div>`}
            </div>
        `;
    }

    /**
     * @param {ViewDebugNode} node
     * @param {number} depth
     * @returns {import("lit").TemplateResult}
     */
    #renderNode(node, depth) {
        const selected = node.id === this.selectedViewId;
        return html`
            <button
                class=${selected ? "node selected" : "node"}
                style=${`padding-left: ${0.65 + depth * 1.1}rem`}
                @click=${() => {
                    this.selectedViewId = node.id;
                }}
                @mouseenter=${() => this.session?.highlightView(node.id)}
                @mouseleave=${() => this.session?.highlightView(undefined)}
            >
                <span class="node-main">
                    ${node.childIds.length > 0 ? "v" : "-"} ${node.name}
                    ${node.chrome
                        ? html`<span class="badge">chrome</span>`
                        : nothing}
                    ${node.visible
                        ? nothing
                        : html`<span class="badge">hidden</span>`}
                </span>
                <span class="node-meta"> ${node.markType ?? node.type} </span>
            </button>
            ${node.childIds.map(
                /**
                 * @param {string} childId
                 * @returns {import("lit").TemplateResult}
                 */
                (childId) => this.#renderNode(this.#getNode(childId), depth + 1)
            )}
        `;
    }

    /**
     * @param {ViewDebugNode} node
     */
    #renderDetails(node) {
        return html`
            <h2>${node.path}</h2>
            <dl>
                <dt>id</dt>
                <dd>${node.id}</dd>
                <dt>class</dt>
                <dd>${node.className}</dd>
                <dt>type</dt>
                <dd>${node.type}</dd>
                <dt>mark</dt>
                <dd>${node.markType ?? "-"}</dd>
                <dt>selector</dt>
                <dd>${node.selector ? JSON.stringify(node.selector) : "-"}</dd>
                <dt>visible</dt>
                <dd>${String(node.visible)}</dd>
                <dt>configured visible</dt>
                <dd>${String(node.configuredVisible)}</dd>
                <dt>data init</dt>
                <dd>${node.dataInitializationState}</dd>
                <dt>bounds</dt>
                <dd>${node.bounds ? JSON.stringify(node.bounds) : "-"}</dd>
            </dl>

            <h3>Encodings</h3>
            ${this.#renderEncodings(node)}

            <h3>Resolutions</h3>
            <dl>
                <dt>scale</dt>
                <dd>${formatRecord(node.scaleResolutionIds)}</dd>
                <dt>axis</dt>
                <dd>${formatRecord(node.axisResolutionIds)}</dd>
                <dt>legend</dt>
                <dd>${formatRecord(node.legendResolutionIds)}</dd>
            </dl>

            <h3>Dataflow</h3>
            ${this.#renderViewDataflow(node)}

            <h3>Params</h3>
            ${this.#renderViewParams(node)}

            <h3>Mark</h3>
            ${this.#renderViewMark(node)}

            <h3>All Resolutions</h3>
            ${this.#renderResolutionPanel()}

            <h3>Spec</h3>
            <pre>${JSON.stringify(node.spec, null, 2)}</pre>
        `;
    }

    /**
     * @param {ViewDebugNode} node
     * @returns {import("lit").TemplateResult}
     */
    #renderViewDataflow(node) {
        const flowNodes = this.#getFlowNodesForView(node.id);
        if (flowNodes.length === 0) {
            return html`<p class="empty">No linked dataflow nodes.</p>`;
        }

        return html`
            <table>
                <thead>
                    <tr>
                        <th>node</th>
                        <th>out</th>
                        <th>state</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${flowNodes.map(
                        (flowNode) => html`
                            <tr>
                                <td>${flowNode.label}</td>
                                <td>${flowNode.count}</td>
                                <td>${formatFlowNodeState(flowNode)}</td>
                                <td>
                                    <button
                                        @click=${() =>
                                            this.#showFlowNode(flowNode.id)}
                                    >
                                        Dataflow
                                    </button>
                                </td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        `;
    }

    /**
     * @param {ViewDebugNode} node
     */
    #renderEncodings(node) {
        const encodings = Object.values(node.encodings);
        if (encodings.length === 0) {
            return html`<p class="empty">No encodings.</p>`;
        }

        return html`
            <table>
                <thead>
                    <tr>
                        <th>channel</th>
                        <th>field / expr / value</th>
                        <th>type</th>
                        <th>scale</th>
                        <th>axis</th>
                        <th>legend</th>
                    </tr>
                </thead>
                <tbody>
                    ${encodings.map(
                        (encoding) => html`
                            <tr>
                                <td>${encoding.channel}</td>
                                <td>
                                    ${encoding.field ??
                                    encoding.expr ??
                                    formatValue(encoding.value)}
                                </td>
                                <td>${encoding.type ?? "-"}</td>
                                <td>${encoding.scaleResolutionId ?? "-"}</td>
                                <td>${encoding.axisResolutionId ?? "-"}</td>
                                <td>${encoding.legendResolutionId ?? "-"}</td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        `;
    }

    #renderResolutionPanel() {
        const { scales, axes, legends } = this.snapshot.resolutions;
        return html`
            <h3>Scales</h3>
            ${this.#renderScaleResolutions(scales)}
            <h3>Axes</h3>
            ${this.#renderAxisResolutions(axes)}
            <h3>Legends</h3>
            ${this.#renderLegendResolutions(legends)}
        `;
    }

    /**
     * @param {import("@genome-spy/core/debug/resolutionDebugSnapshot.js").ScaleResolutionDebugNode[]} scales
     */
    #renderScaleResolutions(scales) {
        if (scales.length === 0) {
            return html`<p class="empty">No scale resolutions.</p>`;
        }

        return html`
            <table>
                <thead>
                    <tr>
                        <th>id</th>
                        <th>channel</th>
                        <th>name</th>
                        <th>type</th>
                        <th>domain</th>
                        <th>members</th>
                    </tr>
                </thead>
                <tbody>
                    ${scales.map(
                        (scale) => html`
                            <tr>
                                <td>${scale.id}</td>
                                <td>${scale.channel}</td>
                                <td>${scale.name ?? "-"}</td>
                                <td>
                                    ${scale.resolvedScaleType ?? scale.type}
                                </td>
                                <td>
                                    ${formatValue(
                                        scale.complexDomain ?? scale.domain
                                    )}
                                </td>
                                <td>
                                    ${scale.members.map(
                                        (member, index) => html`
                                            ${index > 0 ? ", " : nothing}
                                            <span
                                                class="linked"
                                                @click=${() => {
                                                    this.selectedViewId =
                                                        member.viewId;
                                                }}
                                                >${member.viewPath}:${member.channel}</span
                                            >
                                        `
                                    )}
                                </td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        `;
    }

    /**
     * @param {import("@genome-spy/core/debug/resolutionDebugSnapshot.js").AxisResolutionDebugNode[]} axes
     */
    #renderAxisResolutions(axes) {
        if (axes.length === 0) {
            return html`<p class="empty">No axis resolutions.</p>`;
        }

        return html`
            <table>
                <thead>
                    <tr>
                        <th>id</th>
                        <th>channel</th>
                        <th>title</th>
                        <th>scale</th>
                        <th>members</th>
                    </tr>
                </thead>
                <tbody>
                    ${axes.map(
                        (axis) => html`
                            <tr>
                                <td>${axis.id}</td>
                                <td>${axis.channel}</td>
                                <td>${axis.title ?? "-"}</td>
                                <td>${axis.scaleResolutionId ?? "-"}</td>
                                <td>${axis.members.length}</td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        `;
    }

    /**
     * @param {import("@genome-spy/core/debug/resolutionDebugSnapshot.js").LegendResolutionDebugNode[]} legends
     */
    #renderLegendResolutions(legends) {
        if (legends.length === 0) {
            return html`<p class="empty">No legend resolutions.</p>`;
        }

        return html`
            <table>
                <thead>
                    <tr>
                        <th>id</th>
                        <th>channel</th>
                        <th>definitions</th>
                        <th>members</th>
                    </tr>
                </thead>
                <tbody>
                    ${legends.map(
                        (legend) => html`
                            <tr>
                                <td>${legend.id}</td>
                                <td>${legend.channel}</td>
                                <td>${legend.definitionCount}</td>
                                <td>${legend.members.length}</td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        `;
    }

    #renderParamsPanel() {
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
                                @click=${() => {
                                    this.selectedViewId = scope.viewId;
                                    this.activePanel = "elements";
                                }}
                                >${scope.viewPath}</span
                            >
                            <span class="muted">${scope.scopeId}</span>
                        </h3>
                        ${this.#renderParamTable(scope.params)}
                    `
                )}
            </div>
        `;
    }

    /**
     * @param {ViewDebugNode} node
     * @returns {import("lit").TemplateResult}
     */
    #renderViewParams(node) {
        const scope = this.#getParamScope(node.id);
        if (!scope || scope.params.length === 0) {
            return html`<p class="empty">No local params.</p>`;
        }

        return this.#renderParamTable(scope.params);
    }

    /**
     * @param {ParamDebugNode[]} params
     * @returns {import("lit").TemplateResult}
     */
    #renderParamTable(params) {
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

    /**
     * @param {ViewDebugNode} node
     * @returns {import("lit").TemplateResult}
     */
    #renderViewMark(node) {
        const mark = this.#getMark(node.id);
        if (!mark) {
            return html`<p class="empty">No mark for this view.</p>`;
        }

        return html`
            <dl>
                <dt>type</dt>
                <dd>${mark.type}</dd>
                <dt>ready</dt>
                <dd>${String(mark.ready)}</dd>
                <dt>picking</dt>
                <dd>${String(mark.pickingParticipant)}</dd>
                <dt>data count</dt>
                <dd>${mark.dataCount ?? "-"}</dd>
                <dt>vertices</dt>
                <dd>${mark.vertexCount ?? "-"}</dd>
                <dt>allocated vertices</dt>
                <dd>${mark.allocatedVertices ?? "-"}</dd>
                <dt>ranges</dt>
                <dd>${mark.rangeCount}</dd>
                <dt>encoding channels</dt>
                <dd>${mark.encodingChannels.join(", ") || "-"}</dd>
                <dt>encoder channels</dt>
                <dd>${mark.encoderChannels.join(", ") || "-"}</dd>
                <dt>search fields</dt>
                <dd>${mark.searchFields.join(", ") || "-"}</dd>
                <dt>uniforms dirty</dt>
                <dd>${String(mark.markUniformsAltered)}</dd>
            </dl>

            <h3>Mark Props</h3>
            <pre>${formatValue(mark.properties)}</pre>
        `;
    }

    #renderDataflowPanel() {
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
                @click=${() => {
                    this.selectedFlowNodeId = node.id;
                }}
                @mouseenter=${() => this.session?.highlightView(node.viewId)}
                @mouseleave=${() => this.session?.highlightView(undefined)}
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
                              @click=${() => {
                                  this.selectedViewId = node.viewId;
                                  this.activePanel = "elements";
                              }}
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

    async #refresh() {
        if (!this.session) {
            return;
        }

        await this.session.refresh();
    }

    /**
     * @returns {ViewDebugNode | undefined}
     */
    #getRootNode() {
        return this.snapshot.rootId
            ? this.#getNode(this.snapshot.rootId)
            : undefined;
    }

    /**
     * @returns {ViewDebugNode | undefined}
     */
    #getSelectedNode() {
        return this.selectedViewId
            ? this.#getNode(this.selectedViewId)
            : this.#getRootNode();
    }

    /**
     * @param {string} id
     * @returns {ViewDebugNode}
     */
    #getNode(id) {
        const node = this.snapshot.nodes.find(
            (candidate) => candidate.id === id
        );
        if (!node) {
            throw new Error("Unknown inspector node: " + id);
        }
        return node;
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
     * @param {string} viewId
     * @returns {DataflowDebugNode[]}
     */
    #getFlowNodesForView(viewId) {
        return this.snapshot.dataflow.nodes.filter(
            (node) => node.viewId === viewId
        );
    }

    /**
     * @param {string} flowNodeId
     */
    #showFlowNode(flowNodeId) {
        this.selectedFlowNodeId = flowNodeId;
        this.activePanel = "dataflow";
    }

    /**
     * @param {string} viewId
     * @returns {ParamScopeDebugNode | undefined}
     */
    #getParamScope(viewId) {
        return this.snapshot.params.scopes.find(
            (scope) => scope.viewId === viewId
        );
    }

    /**
     * @param {string} viewId
     * @returns {MarkDebugNode | undefined}
     */
    #getMark(viewId) {
        return this.snapshot.marks.marks.find((mark) => mark.viewId === viewId);
    }
}

customElements.define("gs-inspector-panel", GsInspectorPanel);
