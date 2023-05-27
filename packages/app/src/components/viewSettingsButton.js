import { icon } from "@fortawesome/fontawesome-svg-core";
import { faSlidersH } from "@fortawesome/free-solid-svg-icons";
import { LitElement, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import AxisView from "@genome-spy/core/view/axisView";
import LayerView from "@genome-spy/core/view/layerView";
import {
    findUniqueViewNames,
    isCustomViewName,
} from "@genome-spy/core/view/viewUtils";
import { watch } from "../state/watch";
import { queryDependency } from "../utils/dependency";
import { nestPaths } from "../utils/nestPaths";
import { toggleDropdown } from "../utils/ui/dropdown";
import { viewSettingsSlice } from "../viewSettingsSlice";
import {
    nodesToTreesWithAccessor,
    visitTree,
} from "@genome-spy/core/utils/trees";

class ViewSettingsButton extends LitElement {
    /**
     * @typedef {import("@genome-spy/core/view/view").default} View
     */
    constructor() {
        super();

        /** @type {import("../app").default} */
        this.app = undefined;

        /** @type {import("../utils/nestPaths").NestedItem<View>} */
        this.nestedPaths = undefined;

        this.sateWatcher = watch(
            (/** @type {import("../state").State} */ state) =>
                state.viewSettings,
            (_old, viewSettings) => this.requestUpdate()
        );

        this.style.display = "none";
    }

    connectedCallback() {
        super.connectedCallback();

        this.dispatchEvent(
            queryDependency(
                "app",
                (/** @type {import("../app").default} */ app) => {
                    this.app = app;
                }
            )
        );

        this.app.addInitializationListener(() => {
            this.updateToggles();
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
     */
    toolButtonClicked(event) {
        toggleDropdown(event);
    }

    /**
     * @param {UIEvent} event
     * @param {import("@genome-spy/core/view/view").default} view
     */
    handleCheckboxClick(event, view) {
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

        event.stopPropagation();
    }

    handleResetClick() {
        this.app.storeHelper.dispatch(
            viewSettingsSlice.actions.restoreDefaultVisibilities()
        );
    }

    updateToggles() {
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

    renderToggles() {
        const visibilities = this.getVisibilities();

        const viewRoot = this.app.genomeSpy.viewRoot;
        const uniqueNames = findUniqueViewNames(viewRoot);

        /**
         * @param {import("../utils/nestPaths").NestedItem<View>[]} children
         * @param {boolean} [checkedParent]
         */
        var childrenToHtml = (children, checkedParent = true) =>
            children.length
                ? html`
                      <ul class=${checkedParent ? null : "unchecked"}>
                          ${children.map(nestedItemToHtml)}
                      </ul>
                  `
                : nothing;

        /**
         * @param { import("../utils/nestPaths").NestedItem<View>} item
         * @returns {import("lit").TemplateResult}
         */
        var nestedItemToHtml = (/** */ item) => {
            const view = item.item;
            const checked = visibilities[view.name] ?? view.isVisibleInSpec();

            return html`<li>
                <label class="checkbox"
                    ><input
                        type="checkbox"
                        ?disabled=${!uniqueNames.has(view.name) ||
                        !isConfigurable(view)}
                        .checked=${live(checked)}
                        @change=${(/** @type {UIEvent} */ event) =>
                            this.handleCheckboxClick(event, view)}
                    />${view.getTitleText() ?? view.name}
                </label>
                ${checked ? childrenToHtml(item.children, checked) : nothing}
            </li>`;
        };

        return childrenToHtml(this.nestedPaths.children);
    }

    render() {
        const defaultVis = !Object.keys(this.getVisibilities()).length;

        return html`
            <div class="dropdown bookmark-dropdown">
                <button
                    class="tool-btn"
                    title="Toggle view visibilities"
                    @click=${this.toolButtonClicked.bind(this)}
                >
                    ${icon(faSlidersH).node[0]}
                </button>
                <ul
                    class="gs-dropdown-menu"
                    @click=${(/** @type {UIEvent} */ event) =>
                        event.stopPropagation()}
                >
                    <!-- TODO: utility functions for menu items -->
                    <li class="menu-header">View visibility</li>
                    <li>
                        ${defaultVis
                            ? html`<span class="disabled-item"
                                  >Restore defaults</span
                              >`
                            : html`<a @click=${() => this.handleResetClick()}
                                  >Restore defaults</a
                              >`}
                    </li>
                    <li class="menu-divider"></li>

                    <li>
                        ${this.nestedPaths ? this.renderToggles() : nothing}
                    </li>
                </ul>
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
