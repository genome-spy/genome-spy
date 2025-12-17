import { css, html, nothing } from "lit";
import { handleTabClick } from "../../utils/ui/tabs.js";
import InlineSource from "@genome-spy/core/data/sources/inlineSource.js";
import BaseDialog, { showDialog } from "../generic/baseDialog.js";

/**
 * @typedef {object} DataFlowInspectorOptions
 * @property {(view: import("@genome-spy/core/view/view.js").default) => void} [highlightView]
 */

/** @typedef {import("@genome-spy/core/data/flowNode.js").default} FlowNode */
/** @typedef {import("@genome-spy/core/view/view.js").default} View */

export class DataFlowInspectorDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        dataFlow: {},
        options: {},
        selectedFlowNode: { state: true },
        hideTrivial: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                max-width: 700px;
            }

            ul.gs-data-flow-hierarchy {
                border: var(--form-control-border);
                border-radius: 0.25em;

                max-height: calc(50vh - 5em);
                overflow: auto;

                padding-inline-start: 2em;
                ul {
                    padding-inline-start: 1em;
                }

                li {
                    list-style-type: disc;
                }

                .active {
                    background-color: #a0c0ff;
                }
            }

            pre {
                font-size: 90%;
            }

            span[tabindex] {
                cursor: pointer;
            }

            .inline-stats {
                color: #aaa;
            }

            .panes {
                height: calc(30vh - 5em);
                overflow: auto;

                > div {
                    > *:first-child {
                        margin-top: 0;
                    }
                }
            }
        `,
    ];

    constructor() {
        super();
        this.dataFlow = null;
        /** @type {DataFlowInspectorOptions} */
        this.options = {};
        this.selectedFlowNode = null;
        this.hideTrivial = true;
        this.dialogTitle = "Dataflow Inspector";
    }

    renderBody() {
        /** @type {FlowNode[]} */
        const dataSources = this.dataFlow?.dataSources ?? [];

        return html`
            <p>
                The dataflow inspector shows the data sources and subsequent
                transformations in the dataflow. You can inspect the data flow
                nodes by clicking on them. The number after the node type
                indicates the number of data objects propagated by the node
                during the last batch.
            </p>

            <div class="gs-form-group">
                <label class="checkbox">
                    <input
                        type="checkbox"
                        .checked=${this.hideTrivial}
                        @change=${(/** @type {Event} */ e) => {
                            this.hideTrivial = /** @type {HTMLInputElement} */ (
                                e.target
                            ).checked;
                        }}
                    />
                    Hide trivial InlineSources that propagate a single dummy
                    object
                </label>
            </div>

            <ul class="gs-data-flow-hierarchy">
                ${dataSources
                    .filter(
                        (dataSource) =>
                            !(
                                this.hideTrivial &&
                                dataSource instanceof InlineSource &&
                                dataSource.isTrivial()
                            )
                    )
                    .map((node) => this.flowNodeToHtml(node))}
            </ul>

            ${this.selectedFlowNode
                ? html`<div class="gs-flow-node-props">
                      ${this.renderFlowNodeParams(this.selectedFlowNode)}
                  </div>`
                : nothing}
        `;
    }

    /** @param {FlowNode} flowNode */
    renderFlowNodeParams(flowNode) {
        const params = "params" in flowNode ? flowNode.params : null;
        // @ts-ignore
        /** @type {View | null} */
        const view =
            "view" in flowNode ? /** @type {View} */ (flowNode.view) : null;

        // TODO: Implement or use an external tab component
        return html`
            <div class="gs-tabs">
                <ul class="tabs" @click=${handleTabClick}>
                    <li class="active-tab"><button>Params</button></li>
                    <li><button>Data</button></li>
                    <li><button>Other</button></li>
                </ul>
                <div class="panes">
                    <div class="active-tab">
                        ${params
                            ? html`<pre>
${JSON.stringify(params, null, 2)}</pre
                              >`
                            : html`<p>No parameters</p>`}
                    </div>
                    <div>
                        <p>
                            The first data object propagated by the flow node:
                        </p>
                        ${flowNode.children.length == 0
                            ? html`<p>
                                  The node has no children, nothing was
                                  propagated.
                              </p>`
                            : flowNode.stats.count > 0
                              ? html`<pre>
${JSON.stringify(flowNode.stats.first, null, 2)}</pre
                                >`
                              : html`<p>Nothing data was propagated</p>`}
                    </div>
                    <div>
                        <ul>
                            ${view
                                ? html`<li>View: ${view.getPathString()}</li>`
                                : nothing}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * @param {FlowNode} flowNode
     * @returns {import("lit").TemplateResult}
     */
    flowNodeToHtml(flowNode) {
        // @ts-ignore
        const view =
            "view" in flowNode ? /** @type {View} */ (flowNode.view) : null;

        const onHover = this.options?.highlightView
            ? (/** @type {MouseEvent} */ event) =>
                  this.options.highlightView(
                      event.type == "mouseover"
                          ? /** @type {View} */ (view)
                          : null
                  )
            : () => false;

        return html`
            <li>
                <span
                    @click=${() => this.onNodeClick(flowNode)}
                    @mouseover=${onHover}
                    @mouseout=${onHover}
                    tabindex="0"
                    class=${this.selectedFlowNode === flowNode ? "active" : ""}
                >
                    ${flowNode.label}</span
                >
                <span class="inline-stats">
                    ${flowNode.children.length > 0
                        ? html`(out: ${flowNode.stats.count})`
                        : nothing}
                </span>
                <ul>
                    ${flowNode.children.map((/** @type {FlowNode} */ child) =>
                        this.flowNodeToHtml(child)
                    )}
                </ul>
            </li>
        `;
    }

    /** @param {FlowNode} flowNode */
    onNodeClick(flowNode) {
        this.selectedFlowNode = flowNode;
    }
}

customElements.define("gs-dataflow-inspector", DataFlowInspectorDialog);

/**
 * Show the dataflow inspector dialog
 *
 * @param {import("@genome-spy/core/data/dataFlow.js").default<any>} dataFlow
 * @param {DataFlowInspectorOptions} [options]
 * @returns {Promise<import("../generic/baseDialog.js").DialogFinishDetail>}
 */
export function showDataflowInspectorDialog(dataFlow, options = {}) {
    return showDialog(
        "gs-dataflow-inspector",
        /** @param {DataFlowInspectorDialog} el */ (el) => {
            el.dataFlow = dataFlow;
            el.options = options;
        }
    );
}
