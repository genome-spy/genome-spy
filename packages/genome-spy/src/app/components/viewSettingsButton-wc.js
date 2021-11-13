import { icon } from "@fortawesome/fontawesome-svg-core";
import { faSlidersH } from "@fortawesome/free-solid-svg-icons";
import { LitElement, html } from "lit";
import { findViewsHavingUniqueNames } from "../../view/viewUtils";
import { queryDependency } from "../utils/dependency";
import { toggleDropdown } from "../utils/ui/dropdown";
import { viewSettingsSlice } from "../viewSettingsSlice";

class ViewSettingsButton extends LitElement {
    constructor() {
        super();

        /** @type {import("../genomeSpyApp").default} */
        this.app = undefined;

        this.x = 0;
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
    }

    createRenderRoot() {
        return this;
    }

    /**
     * @param {UIEvent} event
     */
    toolButtonClicked(event) {
        const visible = toggleDropdown(event);
        if (visible) {
            this.x++;
            this.requestUpdate();
        }
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

    makeToggles() {
        /* @type {import("lit").TemplateResult[]} */
        //let toggles = [];

        const viewsHavingUniqueName = findViewsHavingUniqueNames(
            this.app.genomeSpy.viewRoot
        );

        const visibilities =
            this.app.storeHelper.state.viewSettings.viewVisibilities;

        return viewsHavingUniqueName.map(
            (view) => html`<li>
                <label class="checkbox"
                    ><input
                        type="checkbox"
                        ?checked=${visibilities[view.name] ??
                        view.isVisibleInSpec()}
                        @change=${(/** @type {UIEvent} */ event) =>
                            this.handleCheckboxClick(event, view)}
                    />
                    ${view.getPathString()}</label
                >
            </li>`
        );
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
                    class="dropdown-menu gs-context-menu"
                    @click=${(/** @type {UIEvent} */ event) =>
                        event.stopPropagation()}
                >
                    ${this.makeToggles()}
                </ul>
            </div>
        `;
    }
}

customElements.define("genome-spy-view-visibility", ViewSettingsButton);
