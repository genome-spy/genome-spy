import { html, nothing, LitElement } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faUndo,
    faRedo,
    faEllipsisH,
    faCircle,
} from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "../../utils/ui/dropdown";

export default class ProvenanceButtons extends LitElement {
    constructor() {
        super();

        /** @type {import("../provenance").default<any>} */
        this.provenance = undefined;
    }

    connectedCallback() {
        super.connectedCallback();
        this.provenance.subscribe(() => {
            this.requestUpdate();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        // TODO: remove listener
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
            const info = this.provenance.getActionInfo(action);
            if (!info) {
                // Skip Redux' internal actions
                return nothing;
            }
            return html`
                <li>
                    <a
                        @click=${() => this.provenance.activateState(index)}
                        class=${index == this.provenance.getCurrentIndex()
                            ? "active"
                            : ""}
                    >
                        ${icon(info.icon ?? faCircle).node[0]}
                        ${info.provenanceTitle ?? info.title}
                    </a>
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
                <ol class="dropdown-menu gs-context-menu">
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
