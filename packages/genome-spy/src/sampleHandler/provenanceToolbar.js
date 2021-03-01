import { html } from "lit-html";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faUndo,
    faRedo,
    faEllipsisH,
    faCircle,
    faCheck
} from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "./dropdown";

/**
 *
 * @param {import("./provenance").default<any>} provenance
 */
export default function getProvenanceButtons(provenance) {
    if (!provenance || !provenance.isInitialized()) {
        return "";
    }

    /**
     *
     * @param {any} action
     * @param {number} index
     */
    const makeDropdownItem = (action, index) => {
        const info = provenance.getActionInfo(action);
        return html`
            <a
                @click=${() => provenance.activateState(index)}
                class=${index == provenance.currentNodeIndex ? "active" : ""}
                ><li>
                    ${index == 0 && !action
                        ? html`
                              ${icon(faCheck).node[0]} The initial state
                          `
                        : html`
                              ${icon(info.icon || faCircle).node[0]}
                              ${info.provenanceTitle || info.title}
                          `}
                </li></a
            >
        `;
    };

    const provenanceDropdown = () => html`
        <div class="dropdown provenance-dropdown">
            <button
                class="tool-btn"
                title="Provenance"
                ?disabled=${provenance.isEmpty()}
                @click=${toggleDropdown}
            >
                ${icon(faEllipsisH).node[0]}
            </button>
            <div class="dropdown-menu context-menu">
                <ol>
                    ${provenance.getFullActionHistory().map(makeDropdownItem)}
                </ol>
            </div>
        </div>
    `;

    return html`
        <div class="btn-group" @click=${e => e.stopPropagation()}>
            <button
                class="tool-btn"
                title="Backtrack samples (B)"
                ?disabled=${!provenance.isUndoable()}
                @click=${() => provenance.undo()}
            >
                ${icon(faUndo).node[0]}
            </button>
            ${provenanceDropdown()}
            <button
                class="tool-btn"
                title="Redo"
                ?disabled=${!provenance.isRedoable()}
                @click=${() => provenance.redo()}
            >
                ${icon(faRedo).node[0]}
            </button>
        </div>
    `;
}
