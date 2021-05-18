import { html, LitElement, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faUndo,
    faRedo,
    faEllipsisH,
    faCircle,
    faCheck
} from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "./dropdown";

export default class ProvenanceButtons extends LitElement {
    constructor() {
        super();

        /** @type {import("./provenance").default<any>} */
        this.provenance = undefined;
    }

    static get properties() {
        return {
            provenance: { type: Object }
        };
    }

    connectedCallback() {
        super.connectedCallback();
        this.provenance?.addListener(() => {
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
        if (!this.provenance?.isInitialized()) {
            return nothing;
        }

        /**
         *
         * @param {any} action
         * @param {number} index
         */
        const makeDropdownItem = (action, index) => {
            const info = this.provenance.getActionInfo(action);
            return html`
                <li>
                    <a
                        @click=${() => this.provenance.activateState(index)}
                        class=${index == this.provenance.currentNodeIndex
                            ? "active"
                            : ""}
                    >
                        ${index == 0 && !action
                            ? html`
                                  ${icon(faCheck).node[0]} The initial state
                              `
                            : html`
                                  ${icon(info.icon || faCircle).node[0]}
                                  ${info.provenanceTitle || info.title}
                              `}
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
                <ol class="dropdown-menu context-menu">
                    ${this.provenance
                        .getFullActionHistory()
                        .map(makeDropdownItem)}
                </ol>
            </div>
        `;

        return html`
            <div class="btn-group" @click=${e => e.stopPropagation()}>
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
