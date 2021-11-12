import { icon } from "@fortawesome/fontawesome-svg-core";
import { faSlidersH } from "@fortawesome/free-solid-svg-icons";
import { LitElement, html } from "lit";
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
            viewSettingsSlice.actions.setVisibility({
                name: view.name,
                visibility: checked,
            })
        );

        event.stopPropagation();
    }

    makeToggles() {
        /** @type {import("lit").TemplateResult[]} */
        const toggles = [];

        this.app.genomeSpy.viewRoot.visit((view) => {
            if (view.name) {
                toggles.push(
                    html`<li>
                        <label class="checkbox"
                            ><input
                                type="checkbox"
                                @change=${(/** @type {UIEvent} */ event) =>
                                    this.handleCheckboxClick(event, view)}
                            />
                            ${view.getPathString()}</label
                        >
                    </li>`
                );
            }
        });

        return toggles;
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
