import { icon } from "@fortawesome/fontawesome-svg-core";
import { faSlidersH } from "@fortawesome/free-solid-svg-icons";
import { LitElement, html } from "lit";
import { live } from "lit/directives/live.js";
import { ref, createRef } from "lit/directives/ref.js";
import AxisView from "@genome-spy/core/view/axisView.js";
import LayerView from "@genome-spy/core/view/layerView.js";
import { findUniqueViewNames } from "@genome-spy/core/view/viewUtils.js";
import { subscribeTo } from "../../state/subscribeTo.js";
import { queryDependency } from "../../utils/dependency.js";
import { nestPaths } from "../../utils/nestPaths.js";
import { viewSettingsSlice } from "../../viewSettingsSlice.js";
import {
    nodesToTreesWithAccessor,
    visitTree,
} from "@genome-spy/core/utils/trees.js";
import { dropdownMenu } from "../../utils/ui/contextMenu.js";
import createBindingInputs from "@genome-spy/core/utils/inputBinding.js";
import { isVariableParameter } from "@genome-spy/core/view/paramMediator.js";
import SubscriptionController from "../generic/subscriptionController.js";

class ViewSettingsButton extends LitElement {
    /** @type {import("../../app.js").default} */
    #app;

    /** @type {import("../../utils/nestPaths.js").NestedItem<View>} */
    #nestedPaths;

    #buttonRef = createRef();

    /**
     * @typedef {import("@genome-spy/core/view/view.js").default} View
     */
    constructor() {
        super();
        this.subscriptionController = new SubscriptionController(this);
        this.style.display = "none";
    }

    connectedCallback() {
        super.connectedCallback();

        this.dispatchEvent(
            queryDependency(
                "app",
                (/** @type {import("../../app.js").default} */ app) => {
                    this.#app = app;
                }
            )
        );

        this.subscriptionController.addUnsubscribeCallback(
            subscribeTo(
                this.#app.store,
                (state) => state.lifecycle.appInitialized,
                (appInitialized) => this.#handleAppInitialized(appInitialized)
            )
        );

        this.subscriptionController.addUnsubscribeCallback(
            subscribeTo(
                this.#app.store,
                (state) => state.viewSettings,
                () => this.requestUpdate()
            )
        );
    }

    createRenderRoot() {
        return this;
    }

    /**
     * @param {boolean} appInitialized
     */
    #handleAppInitialized(appInitialized) {
        if (appInitialized) {
            this.#updateNestedPaths();
            this.requestUpdate();
            this.style.display = this.#nestedPaths.children.length
                ? "block"
                : "none";
        }
    }

    /**
     * @param {UIEvent} event
     * @param {import("@genome-spy/core/view/view.js").default} view
     */
    #handleCheckboxClick(event, view) {
        const checked = /** @type {HTMLInputElement} */ (event.target).checked;

        this.#app.store.dispatch(
            checked != view.isVisibleInSpec()
                ? viewSettingsSlice.actions.setVisibility({
                      name: view.name,
                      visibility: checked,
                  })
                : viewSettingsSlice.actions.restoreDefaultVisibility(view.name)
        );

        // Just to be sure...
        this.requestUpdate();

        // Update reset item
        this.#showDropdown();

        event.stopPropagation();
    }

    #handleResetClick() {
        this.#app.store.dispatch(
            viewSettingsSlice.actions.restoreDefaultVisibilities()
        );
        // Update checkboxes
        this.#showDropdown();
    }

    #updateNestedPaths() {
        const viewRoot = this.#app.genomeSpy.viewRoot;
        if (!viewRoot) {
            return;
        }

        /** @type {View[]} */
        const nodes = [];

        for (const tree of nodesToTreesWithAccessor(
            viewRoot.getDescendants(),
            (view) => view.dataParent
        )) {
            visitTree(tree, {
                preOrder: (node) => {
                    const view = node.ref;
                    if (view instanceof AxisView) {
                        return "skip";
                    }
                    nodes.push(view);
                },
            });
        }

        /**
         * @param {View} view
         */
        const isIncluded = (view) =>
            isConfigurable(view) || hasVariableBindings(view);

        // Do some flattening to the hierarchy, filter some levels out
        const paths = nodes
            .filter(isIncluded)
            .map((view) =>
                [...view.getDataAncestors()].filter(isIncluded).reverse()
            );

        this.#nestedPaths = nestPaths(paths);
    }

    #makeToggles() {
        const visibilities = this.getVisibilities();

        const viewRoot = this.#app.genomeSpy.viewRoot;
        const uniqueNames = findUniqueViewNames(viewRoot);

        /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [];

        /**
         * @param { import("../../utils/nestPaths.js").NestedItem<View>} item
         * @param {number} [depth]
         */
        const nestedItemToHtml = (/** */ item, depth = -1) => {
            const view = item.item;
            const checked = visibilities[view.name] ?? view.isVisibleInSpec();

            /** @type {() => import("../../utils/ui/contextMenu.js").MenuItem[]} */
            let submenuOpener;

            if (
                [...view.paramMediator.paramConfigs.values()].some(
                    (param) => isVariableParameter(param) && param.bind
                )
            ) {
                submenuOpener = () => [
                    {
                        label: "Parameters",
                        type: "header",
                    },
                    { type: "divider" },
                    {
                        customContent: html`<div class="gs-input-binding">
                            ${createBindingInputs(view.paramMediator)}
                        </div>`,
                    },
                ];
            }

            if (depth >= 0) {
                const template = html` <label class="checkbox"
                    ><input
                        style=${`margin-left: ${depth * 1.5}em;`}
                        type="checkbox"
                        ?disabled=${!uniqueNames.has(view.name) ||
                        !isConfigurable(view)}
                        .checked=${live(checked)}
                        @change=${(/** @type {UIEvent} */ event) =>
                            this.#handleCheckboxClick(event, view)}
                    />${view.getTitleText() ?? view.name}
                </label>`;

                items.push({
                    customContent: submenuOpener
                        ? template
                        : html`<li>${template}</li>`,
                    submenu: submenuOpener,
                });
            }

            if (checked) {
                depth++;
                for (const child of item.children) {
                    nestedItemToHtml(child, depth);
                }
            }
        };

        nestedItemToHtml(this.#nestedPaths);

        return items;
    }

    #showDropdown() {
        this.#updateNestedPaths();

        const items = this.#makeToggles();

        const defaultVis = !Object.keys(this.getVisibilities()).length;

        dropdownMenu(
            {
                items: [
                    { label: "View visibility", type: "header" },
                    {
                        label: "Restore defaults",
                        callback: defaultVis
                            ? undefined
                            : () => this.#handleResetClick(),
                    },
                    { type: "divider" },
                    ...items,
                ],
            },
            this.#buttonRef.value,
            "bottom-start"
        );
    }

    render() {
        // TODO: Highlight the button when the dropdown is open.
        return html`
            <div class="dropdown bookmark-dropdown">
                <button
                    ${ref(this.#buttonRef)}
                    class="tool-btn"
                    title="Toggle view visibilities"
                    @click=${this.#showDropdown.bind(this)}
                >
                    ${icon(faSlidersH).node[0]}
                </button>
            </div>
        `;
    }

    getVisibilities() {
        return this.#app.store.getState().viewSettings.visibilities;
    }
}

const isConfigurable = (/** @type {View} */ view) =>
    view.spec.configurableVisibility ??
    !(view.layoutParent && view.layoutParent instanceof LayerView);

const hasVariableBindings = (/** @type {View} */ view) =>
    [...view.paramMediator.paramConfigs.values()].some(
        (param) => isVariableParameter(param) && param.bind
    );

customElements.define("genome-spy-view-visibility", ViewSettingsButton);
