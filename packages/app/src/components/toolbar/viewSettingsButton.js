import { icon } from "@fortawesome/fontawesome-svg-core";
import { faFileUpload, faSlidersH } from "@fortawesome/free-solid-svg-icons";
import { LitElement, html } from "lit";
import { live } from "lit/directives/live.js";
import { ref, createRef } from "lit/directives/ref.js";
import AxisView from "@genome-spy/core/view/axisView.js";
import LayerView from "@genome-spy/core/view/layerView.js";
import { subscribeTo } from "../../state/subscribeTo.js";
import { queryDependency } from "../../utils/dependency.js";
import { nestPaths } from "../../utils/nestPaths.js";
import { viewSettingsSlice } from "../../viewSettingsSlice.js";
import {
    getUniqueViewSelectorKeys,
    getViewVisibilityKey,
    getViewVisibilityOverride,
} from "../../viewSettingsUtils.js";
import {
    nodesToTreesWithAccessor,
    visitTree,
} from "@genome-spy/core/utils/trees.js";
import { dropdownMenu } from "../../utils/ui/contextMenu.js";
import createBindingInputs from "@genome-spy/core/utils/inputBinding.js";
import { isVariableParameter } from "@genome-spy/core/paramRuntime/paramUtils.js";
import SubscriptionController from "../generic/subscriptionController.js";
import { MetadataView } from "../../sampleView/metadata/metadataView.js";
import { showUploadMetadataDialog } from "../../sampleView/metadata/uploadMetadataDialog.js";

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
            this.style.display = this.#nestedPaths ? "block" : "none";
        }
    }

    /**
     * @param {UIEvent} event
     * @param {import("@genome-spy/core/view/view.js").default} view
     */
    #handleCheckboxClick(event, view) {
        const checked = /** @type {HTMLInputElement} */ (event.target).checked;
        const selectorKey = getViewVisibilityKey(view);
        if (!selectorKey) {
            throw new Error(
                "Cannot toggle view visibility without an explicit name."
            );
        }

        if (checked != view.isVisibleInSpec()) {
            this.#app.store.dispatch(
                viewSettingsSlice.actions.setVisibility({
                    key: selectorKey,
                    visibility: checked,
                })
            );
        } else {
            this.#app.store.dispatch(
                viewSettingsSlice.actions.restoreDefaultVisibility(selectorKey)
            );

            // Clear legacy explicit-name overrides too. Otherwise an old
            // bookmark key can keep the view invisible even after restoring.
            if (view.explicitName && view.explicitName !== selectorKey) {
                this.#app.store.dispatch(
                    viewSettingsSlice.actions.restoreDefaultVisibility(
                        view.explicitName
                    )
                );
            }
        }

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

        // Do some flattening to the hierarchy, filter some levels out
        const paths = nodes
            .filter(isIncluded)
            .map((view) =>
                [...view.getDataAncestors()]
                    .filter(
                        (ancestor) =>
                            ancestor === viewRoot || isIncluded(ancestor)
                    )
                    .reverse()
            );

        if (!paths.length) {
            this.#nestedPaths = undefined;
            return;
        }

        this.#nestedPaths = nestPaths(paths);
    }

    #makeToggles() {
        const visibilities = this.getVisibilities();

        const viewRoot = this.#app.genomeSpy.viewRoot;
        const uniqueSelectorKeys = viewRoot
            ? getUniqueViewSelectorKeys(viewRoot)
            : new Set();

        /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [];

        /**
         * @param { import("../../utils/nestPaths.js").NestedItem<View>} item
         * @param {number} [depth]
         */
        const nestedItemToHtml = (/** */ item, depth = -1) => {
            const view = item.item;
            const visibilityOverride = getViewVisibilityOverride(
                visibilities,
                view
            );
            const checked =
                visibilityOverride !== undefined
                    ? visibilityOverride
                    : view.isVisibleInSpec();
            const selectorKey = getViewVisibilityKey(view);

            /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
            const submenuItems = [];

            if (hasVariableBindings(view)) {
                submenuItems.push(
                    {
                        label: "Parameters",
                        type: "header",
                    },
                    { type: "divider" },
                    {
                        customContent: html`<div class="gs-input-binding">
                            ${createBindingInputs(view.paramRuntime)}
                        </div>`,
                    }
                );
            }

            if (view instanceof MetadataView) {
                if (submenuItems.length) {
                    submenuItems.push({ type: "divider" });
                }
                submenuItems.push(
                    {
                        label: "Sample metadata",
                        type: "header",
                    },
                    { type: "divider" },
                    {
                        label: "Upload custom metadata",
                        icon: faFileUpload,
                        callback: () => this.#showUploadMetadataDialog(),
                    }
                );
            }

            /** @type {() => import("../../utils/ui/contextMenu.js").MenuItem[]} */
            let submenuOpener;

            if (submenuItems.length) {
                submenuOpener = () => submenuItems;
            }

            if (depth >= 0) {
                const template = html` <label
                    class="checkbox"
                    @mouseover=${(/** @type {MouseEvent} */ event) =>
                        this.#handleViewHover(event, view)}
                    @mouseout=${(/** @type {MouseEvent} */ event) =>
                        this.#handleViewHover(event, view)}
                >
                    <input
                        style=${`margin-left: ${depth * 1.5}em;`}
                        type="checkbox"
                        ?disabled=${!selectorKey ||
                        !uniqueSelectorKeys.has(selectorKey) ||
                        !isVisibilityConfigurable(view)}
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

        if (!this.#nestedPaths) {
            return items;
        }

        const startDepth = this.#nestedPaths.children.length ? -1 : 0;
        nestedItemToHtml(this.#nestedPaths, startDepth);

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

    /**
     * @param {MouseEvent} event
     * @param {View} view
     */
    #handleViewHover(event, view) {
        if (event.type == "mouseover") {
            this.#app.genomeSpy.viewRoot.context.highlightView(view);
        } else {
            this.#app.genomeSpy.viewRoot.context.highlightView(null);
        }
    }

    #showUploadMetadataDialog() {
        const sampleView = this.#app.getSampleView();
        if (!sampleView) {
            throw new Error("Cannot upload metadata without SampleView");
        } else {
            showUploadMetadataDialog(sampleView);
        }
    }
}

const isVisibilityConfigurable = (/** @type {View} */ view) =>
    view.spec.configurableVisibility ??
    !(view.layoutParent && view.layoutParent instanceof LayerView);

const hasVariableBindings = (/** @type {View} */ view) =>
    [...view.paramRuntime.paramConfigs.values()].some(
        (param) => isVariableParameter(param) && param.bind
    );

const isIncluded = (/** @type {View} */ view) =>
    (isVisibilityConfigurable(view) && Boolean(view.explicitName)) ||
    hasVariableBindings(view) ||
    view instanceof MetadataView;

customElements.define("genome-spy-view-visibility", ViewSettingsButton);
