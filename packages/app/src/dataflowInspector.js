import { html, nothing, render } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { messageBox } from "./utils/ui/modal.js";
import { handleTabClick } from "./utils/ui/tabs.js";
import InlineSource from "@genome-spy/core/data/sources/inlineSource.js";

/**
 *
 * @param {import("@genome-spy/core/data/dataFlow.js").default<any>} dataFlow
 */
export function showDataflowInspectorDialog(dataFlow) {
    const dataSources = dataFlow.dataSources;

    const propsRef = createRef();

    /** @type {import( "@genome-spy/core/data/flowNode.js").default} */
    let selectedFlowNode = null;

    /**
     * Should trivial InlineSources be hidden, i.e., those that propagate a single dummy object.
     */
    let hideTrivial = true;

    const h = html`
        <p>
            The dataflow inspector shows the data sources and subsequent
            transformations in the dataflow. You can inspect the data flow nodes
            by clicking on them. The number after the node type indicates the
            number of data objects propagated by the node during the last batch.
        </p>

        <div class="gs-data-flow-debugger">
            <div class="gs-form-group">
                <label class="checkbox">
                    <input
                        type="checkbox"
                        .checked=${hideTrivial}
                        @change=${(/** @type {MouseEvent} */ e) => {
                            hideTrivial = /** @type {HTMLInputElement} */ (
                                e.target
                            ).checked;
                            renderAll();
                        }}
                    />
                    Hide trivial InlineSources that propagate a single dummy
                    object
                </label>
            </div>
            <div ${ref(propsRef)}></div>
        </div>
    `;

    messageBox(h, {
        title: "Dataflow Inspector",
        okLabel: "Close",
    });

    function renderAll() {
        render(getHtml(), /** @type {HTMLElement} */ (propsRef.value));
    }

    renderAll();

    /**
     * @param {import("@genome-spy/core/data/flowNode.js").default} flowNode
     */
    function onNodeClick(flowNode) {
        selectedFlowNode = flowNode;

        render(getHtml(), /** @type {HTMLElement} */ (propsRef.value));
    }

    function getHtml() {
        return html`<ul class="gs-data-flow-hierarchy">
                ${dataSources
                    .filter(
                        (dataSource) =>
                            !(
                                hideTrivial &&
                                dataSource instanceof InlineSource &&
                                dataSource.isTrivial()
                            )
                    )
                    .map(flowNodeToHtml)}
            </ul>
            ${selectedFlowNode
                ? html`
                      <div class="gs-flow-node-props">
                          ${flowNodeParamsToHtml(selectedFlowNode)}
                      </div>
                  `
                : nothing}`;
    }

    /**
     * @param {import("@genome-spy/core/data/flowNode.js").default} flowNode
     */
    function flowNodeParamsToHtml(flowNode) {
        /** @type {object} */
        const params =
            "params" in flowNode ? /** @type {any} */ (flowNode.params) : null;

        /** @type {import("@genome-spy/core/view/view.js").default} */
        // @ts-ignore
        const view = "view" in flowNode ? flowNode.view : null;

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
     * Returns a HTML representation of a flow node and all its children.
     *
     * @param {import("@genome-spy/core/data/flowNode.js").default} flowNode
     * @returns {import("lit").TemplateResult}
     */
    function flowNodeToHtml(flowNode) {
        return html`
            <li>
                <span
                    @click=${() => onNodeClick(flowNode)}
                    tabindex="0"
                    class=${selectedFlowNode === flowNode ? "active" : ""}
                >
                    ${flowNode.label}</span
                >
                <span class="inline-stats">
                    ${flowNode.children.length > 0
                        ? html`(out: ${flowNode.stats.count})`
                        : nothing}
                </span>
                <ul>
                    ${flowNode.children.map(flowNodeToHtml)}
                </ul>
            </li>
        `;
    }
}
