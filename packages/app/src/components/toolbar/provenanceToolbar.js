import { html, nothing, LitElement } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faUndo,
    faRedo,
    faEllipsisH,
    faCircle,
    faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "../../utils/ui/dropdown.js";
import SubscriptionController from "../generic/subscriptionController.js";

export default class ProvenanceButtons extends LitElement {
    constructor() {
        super();

        /** @type {import("../../state/provenance.js").default} */
        this.provenance = undefined;
        this._subscriptions = new SubscriptionController(this);
    }

    connectedCallback() {
        super.connectedCallback();

        const unsubscribe = this.provenance.store.subscribe(() => {
            this.requestUpdate();
        });
        this._subscriptions.addUnsubscribeCallback(unsubscribe);
    }

    createRenderRoot() {
        return this;
    }

    render() {
        /**
         *
         * @param {any} action
         * @param {number} index
         */
        const makeDropdownItem = (action, index) => {
            if (!action) {
                return nothing;
            }

            const info = this.provenance.getActionInfo(action);
            if (!info) {
                // Skip Redux' internal actions
                return nothing;
            }

            const infoTemplate =
                index == 0
                    ? html`${icon(faCheck).node[0]} Initial state`
                    : html` ${icon(info.icon ?? faCircle).node[0]}
                      ${info.provenanceTitle ?? info.title}`;

            return html`
                <li>
                    <a
                        @click=${() => this.provenance.activateState(index)}
                        class=${index == this.provenance.getCurrentIndex()
                            ? "active-state"
                            : ""}
                        >${infoTemplate}</a
                    >
                </li>
            `;
        };

        const provenanceDropdown = () => html`
            <div class="dropdown provenance-dropdown">
                <button
                    class="tool-btn"
                    title="Provenance"
                    ?disabled=${this.provenance.isEmpty()}
                    @click=${toggleDropdown}
                >
                    ${icon(faEllipsisH).node[0]}
                </button>
                <ol class="gs-dropdown-menu provenance-menu">
                    ${this.provenance
                        .getFullActionHistory()
                        .map(makeDropdownItem)}
                </ol>
            </div>
        `;

        return html`
            <div
                class="btn-group"
                @click=${(/** @type {MouseEvent} */ e) => e.stopPropagation()}
            >
                <button
                    class="tool-btn"
                    title="Backtrack samples (B)"
                    ?disabled=${!this.provenance.isUndoable()}
                    @click=${() => this.provenance.undo()}
                >
                    ${icon(faUndo).node[0]}
                </button>
                ${provenanceDropdown()}
                <button
                    class="tool-btn"
                    title="Redo"
                    ?disabled=${!this.provenance.isRedoable()}
                    @click=${() => this.provenance.redo()}
                >
                    ${icon(faRedo).node[0]}
                </button>
            </div>
        `;
    }
}

customElements.define("genome-spy-provenance-buttons", ProvenanceButtons);
