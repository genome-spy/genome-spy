import { icon } from "@fortawesome/fontawesome-svg-core";
import { faSlidersH } from "@fortawesome/free-solid-svg-icons";
import { LitElement, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import AxisView from "../../view/axisView";
import DecoratorView from "../../view/decoratorView";
import LayerView from "../../view/layerView";
import { VISIT_SKIP } from "../../view/view";
import { findUniqueViewNames, isCustomViewName } from "../../view/viewUtils";
import { watch } from "../state/watch";
import { queryDependency } from "../utils/dependency";
import { nestPaths } from "../utils/nestPaths";
import { toggleDropdown } from "../utils/ui/dropdown";
import { viewSettingsSlice } from "../viewSettingsSlice";

/**
 * @typedef {import("../../view/view").default} View
 */
class ViewSettingsButton extends LitElement {
    constructor() {
        super();

        /** @type {import("../genomeSpyApp").default} */
        this.app = undefined;

        /** @type {import("../utils/nestPaths").NestedItem<View>} */
        this.nestedPaths = undefined;

        this.sateWatcher = watch(
            (/** @type {import("../state").State} */ state) =>
                state.viewSettings?.visibilities,
            (_old, _new) => {
                this.updateToggles();
                this.requestUpdate();
            }
        );
    }

    connectedCallback() {
        super.connectedCallback();

        this.dispatchEvent(
            queryDependency(
                "app",
                (/** @type {import("../genomeSpyApp").default} */ app) => {
                    this.app = app;
                }
            )
        );

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
     * @param {import("../../view/view").default} view
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

        /** @type {View[]} */
        const views = [];

        viewRoot.visit((view) => {
            if (view instanceof AxisView) {
                return VISIT_SKIP;
            }
            views.push(view);
        });

        const paths = views
            .filter(
                (view) =>
                    !(view instanceof DecoratorView) &&
                    isCustomViewName(view.name) &&
                    isConfigurable(view)
            )
            .map((view) =>
                [...view.getAncestors()]
                    .filter((view) => !(view instanceof DecoratorView))
                    .reverse()
            );

        this.nestedPaths = nestPaths(paths);
    }

    renderToggles() {
        const visibilities =
            this.app.storeHelper.state.viewSettings.visibilities;

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
                    />${view.spec.title ?? view.name}
                </label>
                ${childrenToHtml(item.children, checked)}
            </li>`;
        };

        return childrenToHtml(this.nestedPaths.children);
    }

    render() {
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
                    class="gs-context-menu gs-dropdown-menu"
                    @click=${(/** @type {UIEvent} */ event) =>
                        event.stopPropagation()}
                >
                    <!-- TODO: utility functions for menu items -->
                    <li class="context-menu-header">View visibility</li>
                    <a
                        class="context-menu-item"
                        @click=${() => this.handleResetClick()}
                        >Restore defaults</a
                    >
                    <li class="context-menu-divider"></li>

                    <li>
                        ${this.nestedPaths ? this.renderToggles() : nothing}
                    </li>
                </ul>
            </div>
        `;
    }
}

const isConfigurable = (/** @type {View} */ view) =>
    view.spec.configurableVisibility ??
    !(view.parent && view.parent instanceof LayerView);

customElements.define("genome-spy-view-visibility", ViewSettingsButton);
