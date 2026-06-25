import { LitElement, html, nothing } from "lit";
import {
    formatFlowNodeState,
    formatRecord,
    formatValue,
} from "./formatters.js";
import "./dataflowPanel.js";
import { renderParamTable } from "./paramsPanel.js";
import { inspectorPanelStyles } from "./sharedStyles.js";

/**
 * @typedef {import("@genome-spy/core/debug/viewDebugSnapshot.js").ViewDebugNode} ViewDebugNode
 * @typedef {import("@genome-spy/core/debug/dataflowDebugSnapshot.js").DataflowDebugNode} DataflowDebugNode
 * @typedef {import("@genome-spy/core/debug/paramDebugSnapshot.js").ParamScopeDebugNode} ParamScopeDebugNode
 * @typedef {import("@genome-spy/core/debug/markDebugSnapshot.js").MarkDebugNode} MarkDebugNode
 */

export class GsInspectorPanel extends LitElement {
    static properties = {
        session: { attribute: false },
        snapshot: { state: true },
        selectedViewId: { state: true },
        selectedFlowNodeId: { state: true },
        activePanel: { state: true },
        expandedResolutionMemberIds: { state: true },
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
        /** @type {Set<string>} */
        this.expandedResolutionMemberIds = new Set();
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
        if (changed.has("selectedViewId") || changed.has("activePanel")) {
            this.#scrollSelectedNodeIntoView();
        }
    }

    /** @type {(() => void) | undefined} */
    #disconnect = undefined;

    /**
     * @param {CustomEvent<{ viewId: string }>} event
     */
    #handleSelectView = (event) => {
        this.selectedViewId = event.detail.viewId;
        this.activePanel = "elements";
    };

    /**
     * @param {CustomEvent<{ flowNodeId: string }>} event
     */
    #handleSelectFlowNode = (event) => {
        this.selectedFlowNodeId = event.detail.flowNodeId;
    };

    /**
     * @param {CustomEvent<{ viewId: string | undefined }>} event
     */
    #handleHighlightView = (event) => {
        this.session?.highlightView(event.detail.viewId);
    };

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

    #scrollSelectedNodeIntoView() {
        if (
            this.activePanel !== "elements" &&
            this.activePanel !== "resolutions"
        ) {
            return;
        }

        const selectedNode = this.renderRoot.querySelector(
            `.node.selected[data-view-id="${this.selectedViewId}"]`
        );
        selectedNode?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
        });
    }

    render() {
        const root = this.#getRootNode();
        const selected = this.#getSelectedNode();

        return html`
            <div class="shell">
                <div class="toolbar">
                    <strong class="toolbar-title">Inspector</strong>
                    <span class="panel-tabs">
                        ${this.#renderPanelTab("elements", "Views")}
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
            return html`
                <gs-inspector-dataflow-panel
                    .snapshot=${this.snapshot}
                    .selectedFlowNodeId=${this.selectedFlowNodeId}
                    @select-flow-node=${this.#handleSelectFlowNode}
                    @select-view=${this.#handleSelectView}
                    @highlight-view=${this.#handleHighlightView}
                ></gs-inspector-dataflow-panel>
            `;
        }

        if (this.activePanel === "params") {
            return html`
                <gs-inspector-params-panel
                    .snapshot=${this.snapshot}
                    @select-view=${this.#handleSelectView}
                ></gs-inspector-params-panel>
            `;
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
                        Show view chrome
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
                data-view-id=${node.id}
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
            ${this.#renderDebugErrors(node)}
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
            <p class="section-note">
                Channels defined on this view and the resolution ids they use.
            </p>
            ${this.#renderEncodings(node)}

            <h3>Resolutions</h3>
            <p class="section-note">
                Direct scale, axis, and legend resolution ids registered on this
                view.
            </p>
            <dl>
                <dt>scale</dt>
                <dd>${formatRecord(node.scaleResolutionIds)}</dd>
                <dt>axis</dt>
                <dd>${formatRecord(node.axisResolutionIds)}</dd>
                <dt>legend</dt>
                <dd>${formatRecord(node.legendResolutionIds)}</dd>
            </dl>

            <h3>Dataflow</h3>
            <p class="section-note">
                Flow nodes owned by this view. Use the Dataflow button to jump
                to the full flow tree.
            </p>
            ${this.#renderViewDataflow(node)}

            <h3>Params</h3>
            <p class="section-note">Params declared in this view scope.</p>
            ${this.#renderViewParams(node)}

            <h3>Mark</h3>
            <p class="section-note">
                Runtime mark state for unit views, including data and vertex
                counts.
            </p>
            ${this.#renderViewMark(node)}

            <h3>Related Resolutions</h3>
            <p class="section-note">
                Resolutions that this view uses directly or participates in as a
                member. The Resolutions tab shows the global list.
            </p>
            ${this.#renderRelatedResolutions(node)}

            <h3>Spec</h3>
            <p class="section-note">
                Authored or generated view spec snapshot for this runtime view.
            </p>
            <pre>${JSON.stringify(node.spec, null, 2)}</pre>
        `;
    }

    /**
     * @param {ViewDebugNode} node
     * @returns {import("lit").TemplateResult | typeof nothing}
     */
    #renderDebugErrors(node) {
        if (!node.debugErrors || node.debugErrors.length === 0) {
            return nothing;
        }

        return html`
            <div class="debug-errors">
                <strong>Incomplete debug snapshot</strong>
                <ul>
                    ${node.debugErrors.map(
                        (error) => html`
                            <li>${error.field}: ${error.message}</li>
                        `
                    )}
                </ul>
            </div>
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
     * @param {ViewDebugNode} node
     * @returns {import("lit").TemplateResult}
     */
    #renderRelatedResolutions(node) {
        const { scales, axes, legends } =
            /** @type {import("@genome-spy/core/debug/resolutionDebugSnapshot.js").ResolutionDebugSnapshot} */ (
                this.snapshot.resolutions
            );
        const scaleIds = new Set(Object.values(node.scaleResolutionIds));
        const axisIds = new Set(Object.values(node.axisResolutionIds));
        const legendIds = new Set(Object.values(node.legendResolutionIds));
        const relatedScales = scales.filter(
            (scale) =>
                scaleIds.has(scale.id) ||
                scale.members.some((member) => member.viewId === node.id)
        );
        const relatedAxes = axes.filter(
            (axis) =>
                axisIds.has(axis.id) ||
                axis.members.some((member) => member.viewId === node.id)
        );
        const relatedLegends = legends.filter(
            (legend) =>
                legendIds.has(legend.id) ||
                legend.members.some((member) => member.viewId === node.id)
        );

        if (
            relatedScales.length === 0 &&
            relatedAxes.length === 0 &&
            relatedLegends.length === 0
        ) {
            return html`<p class="empty">No related resolutions.</p>`;
        }

        return html`
            <h4>Scales</h4>
            ${this.#renderScaleResolutions(relatedScales)}
            <h4>Axes</h4>
            ${this.#renderAxisResolutions(relatedAxes)}
            <h4>Legends</h4>
            ${this.#renderLegendResolutions(relatedLegends)}
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
                        <th>owner</th>
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
                                    ${this.#renderViewLink(
                                        scale.hostViewId,
                                        scale.hostViewPath,
                                        "Jump to owner view"
                                    )}
                                </td>
                                <td>
                                    ${this.#renderResolutionMembers(
                                        scale.id,
                                        scale.members
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
                        <th>owner</th>
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
                                <td>
                                    ${this.#renderViewLink(
                                        axis.hostViewId,
                                        axis.hostViewPath,
                                        "Jump to owner view"
                                    )}
                                </td>
                                <td>
                                    ${this.#renderResolutionMembers(
                                        axis.id,
                                        axis.members
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
                        <th>owner</th>
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
                                <td>
                                    ${this.#renderViewLink(
                                        legend.hostViewId,
                                        legend.hostViewPath,
                                        "Jump to owner view"
                                    )}
                                </td>
                                <td>
                                    ${this.#renderResolutionMembers(
                                        legend.id,
                                        legend.members
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
     * @param {string} resolutionId
     * @param {{ viewId: string, viewPath: string, chrome?: boolean, channel: string }[]} members
     * @returns {import("lit").TemplateResult}
     */
    #renderResolutionMembers(resolutionId, members) {
        if (members.length === 0) {
            return html`<span class="muted">none</span>`;
        }

        const orderedMembers = members.slice().sort((a, b) => {
            return Number(Boolean(a.chrome)) - Number(Boolean(b.chrome));
        });
        const expanded = this.expandedResolutionMemberIds.has(resolutionId);
        const visibleMembers = expanded
            ? orderedMembers
            : orderedMembers.slice(0, 5);
        return html`
            <ul class="member-list">
                ${visibleMembers.map((member) =>
                    member.viewId === this.selectedViewId
                        ? html`
                              <li>
                                  <span class="current-member">
                                      ${member.viewPath}:${member.channel}
                                  </span>
                                  ${member.chrome
                                      ? html`<span class="badge">chrome</span>`
                                      : nothing}
                              </li>
                          `
                        : html`
                              <li>
                                  <button
                                      class="link-button"
                                      title="Jump to member view"
                                      @click=${() => {
                                          void this.#showView(member);
                                      }}
                                      @mouseenter=${() =>
                                          this.session?.highlightView(
                                              member.viewId
                                          )}
                                      @mouseleave=${() =>
                                          this.session?.highlightView(
                                              undefined
                                          )}
                                  >
                                      ${member.viewPath}:${member.channel}
                                  </button>
                                  ${member.chrome
                                      ? html`<span class="badge">chrome</span>`
                                      : nothing}
                              </li>
                          `
                )}
            </ul>
            ${members.length > visibleMembers.length
                ? html`
                      <button
                          class="inline-action"
                          @click=${() =>
                              this.#setResolutionMembersExpanded(
                                  resolutionId,
                                  true
                              )}
                      >
                          Show all ${members.length}
                      </button>
                  `
                : nothing}
            ${expanded && members.length > 5
                ? html`
                      <button
                          class="inline-action"
                          @click=${() =>
                              this.#setResolutionMembersExpanded(
                                  resolutionId,
                                  false
                              )}
                      >
                          Show fewer
                      </button>
                  `
                : nothing}
        `;
    }

    /**
     * @param {string | undefined} viewId
     * @param {string | undefined} viewPath
     * @param {string} title
     * @returns {import("lit").TemplateResult}
     */
    #renderViewLink(viewId, viewPath, title) {
        if (!viewId || !viewPath) {
            return html`<span class="muted">-</span>`;
        }

        if (viewId === this.selectedViewId) {
            return html`<span class="current-member">${viewPath}</span>`;
        }

        return html`
            <button
                class="link-button"
                title=${title}
                @click=${() => {
                    void this.#showView({ viewId });
                }}
                @mouseenter=${() => this.session?.highlightView(viewId)}
                @mouseleave=${() => this.session?.highlightView(undefined)}
            >
                ${viewPath}
            </button>
        `;
    }

    /**
     * @param {{ viewId: string }} target
     * @returns {Promise<void>}
     */
    async #showView(target) {
        if (!this.#hasNode(target.viewId) && this.session) {
            await this.session.setIncludeChrome(true);
            this.snapshot = this.session.snapshot;
        }

        if (this.#hasNode(target.viewId)) {
            this.selectedViewId = target.viewId;
        }
        this.activePanel = "elements";
        this.session?.highlightView(undefined);
        await this.updateComplete;
        this.#scrollSelectedNodeIntoView();
    }

    /**
     * @param {string} resolutionId
     * @param {boolean} expanded
     */
    #setResolutionMembersExpanded(resolutionId, expanded) {
        const ids = new Set(this.expandedResolutionMemberIds);
        if (expanded) {
            ids.add(resolutionId);
        } else {
            ids.delete(resolutionId);
        }
        this.expandedResolutionMemberIds = ids;
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

        return renderParamTable(scope.params);
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
     * @returns {boolean}
     */
    #hasNode(id) {
        return this.snapshot.nodes.some((candidate) => candidate.id === id);
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
