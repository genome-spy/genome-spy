import { icon } from "@fortawesome/fontawesome-svg-core";
import { faSlidersH } from "@fortawesome/free-solid-svg-icons";
import { LitElement, html } from "lit";
import { live } from "lit/directives/live.js";
import { ref, createRef } from "lit/directives/ref.js";
import AxisView from "@genome-spy/core/view/axisView.js";
import LayerView from "@genome-spy/core/view/layerView.js";
import {
    findUniqueViewNames,
    isCustomViewName,
} from "@genome-spy/core/view/viewUtils.js";
import { watch } from "../state/watch.js";
import { queryDependency } from "../utils/dependency.js";
import { nestPaths } from "../utils/nestPaths.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import {
    nodesToTreesWithAccessor,
    visitTree,
} from "@genome-spy/core/utils/trees.js";
import { dropdownMenu } from "../utils/ui/contextMenu.js";
import createBindingInputs from "@genome-spy/core/utils/inputBinding.js";

class ViewSettingsButton extends LitElement {
    /**
     * @typedef {import("@genome-spy/core/view/view.js").default} View
     */
    constructor() {
        super();

        /** @type {import("../app.js").default} */
        this.app = undefined;

        /** @type {import("../utils/nestPaths.js").NestedItem<View>} */
        this.nestedPaths = undefined;

        this.sateWatcher = watch(
            (/** @type {import("../state.js").State} */ state) =>
                state.viewSettings,
            (_old, viewSettings) => this.requestUpdate()
        );

        this.style.display = "none";

        this.buttonRef = createRef();
    }

    connectedCallback() {
        super.connectedCallback();

        this.dispatchEvent(
            queryDependency(
                "app",
                (/** @type {import("../app.js").default} */ app) => {
                    this.app = app;
                }
            )
        );

        this.app.addInitializationListener(() => {
            this.#updateToggles();
            this.requestUpdate();
            this.style.display = this.nestedPaths.children.length
                ? "block"
                : "none";
        });

        this.app.storeHelper.subscribe(this.sateWatcher);
    }

    disconnectedCallback() {
        this.app.storeHelper.unsubscribe(this.sateWatcher);
    }

    createRenderRoot() {
        return this;
    }

    /**
     * @param {UIEvent} event
     * @param {import("@genome-spy/core/view/view.js").default} view
     */
    #handleCheckboxClick(event, view) {
        const checked = /** @type {HTMLInputElement} */ (event.target).checked;

        this.app.storeHelper.dispatch(
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
        this.app.storeHelper.dispatch(
            viewSettingsSlice.actions.restoreDefaultVisibilities()
        );
        // Update checkboxes
        this.#showDropdown();
    }

    #updateToggles() {
        const viewRoot = this.app.genomeSpy.viewRoot;
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
            .filter(
                (view) => isCustomViewName(view.name) && isConfigurable(view)
            )
            .map((view) => [...view.getDataAncestors()].reverse());

        this.nestedPaths = nestPaths(paths);
    }

    #makeToggles() {
        const visibilities = this.getVisibilities();

        const viewRoot = this.app.genomeSpy.viewRoot;
        const uniqueNames = findUniqueViewNames(viewRoot);

        /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [];

        /**
         * @param { import("../utils/nestPaths.js").NestedItem<View>} item
         * @param {number} [depth]
         */
        const nestedItemToHtml = (/** */ item, depth = -1) => {
            const view = item.item;
            const checked = visibilities[view.name] ?? view.isVisibleInSpec();

            /** @type {() => import("../utils/ui/contextMenu.js").MenuItem[]} */
            let submenuOpener;

            if (view.paramMediator.paramConfigs.size) {
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

        nestedItemToHtml(this.nestedPaths);

        return items;
    }

    #showDropdown() {
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
            this.buttonRef.value,
            "bottom-start"
        );
    }

    render() {
        // TODO: Highlight the button when the dropdown is open.
        return html`
            <div class="dropdown bookmark-dropdown">
                <button
                    ${ref(this.buttonRef)}
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
        return this.app.storeHelper.state.viewSettings.visibilities;
    }
}

const isConfigurable = (/** @type {View} */ view) =>
    view.spec.configurableVisibility ??
    !(view.layoutParent && view.layoutParent instanceof LayerView);

customElements.define("genome-spy-view-visibility", ViewSettingsButton);
