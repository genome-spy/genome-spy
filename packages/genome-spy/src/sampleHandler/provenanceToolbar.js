import { html } from "lit-html";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faUndo,
    faRedo,
    faEllipsisH,
    faBookmark,
    faCircle
} from "@fortawesome/free-solid-svg-icons";

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
                    ${icon(info.icon || faCircle).node[0]}
                    ${info.provenanceTitle || info.title}
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

        <button
            class="tool-btn"
            title="Bookmark"
            ?disabled=${provenance.isAtInitialState()}
            @click=${() =>
                console.log(JSON.stringify(provenance.getActionHistory()))}
        >
            ${icon(faBookmark).node[0]}
        </button>
    `;
}

/**
 *
 * @param {UIEvent} event
 */
function toggleDropdown(event) {
    const target = /** @type {HTMLElement} */ (event.currentTarget);
    const dropdown = /** @type {HTMLElement} */ (target.parentNode);

    if (!dropdown.classList.contains("show")) {
        event.stopPropagation();
        dropdown.classList.add("show");
        window.addEventListener(
            "click",
            e => {
                if (dropdown.classList.contains("show")) {
                    dropdown.classList.remove("show");
                    e.preventDefault();
                }
            },
            { once: true }
        );
    } else {
        window.dispatchEvent(new MouseEvent("click"));
    }
}
