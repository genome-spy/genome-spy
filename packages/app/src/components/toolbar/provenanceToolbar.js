import { html, LitElement } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faUndo,
    faRedo,
    faEllipsisH,
    faCircle,
    faCheck,
} from "@fortawesome/free-solid-svg-icons";
import {
    dismissDropdownMenu,
    dropdownMenu,
    isDropdownOpenFor,
} from "../../utils/ui/contextMenu.js";
import SubscriptionController from "../generic/subscriptionController.js";
import { isBaselineAction } from "../../state/provenanceBaseline.js";

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

    #makeHistoryItems() {
        /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [];
        this.provenance.getFullActionHistory().forEach((action, index) => {
            if (!action) {
                return;
            }
            const baselineAction = isBaselineAction(action);
            const info = baselineAction
                ? undefined
                : this.provenance.getActionInfo(action);

            if (!baselineAction && !info) {
                // Skip Redux' internal actions
                return;
            }

            items.push({
                label: baselineAction
                    ? "Initial state"
                    : (info.provenanceTitle ?? info.title),
                icon: baselineAction ? faCheck : (info.icon ?? faCircle),
                current: index === this.provenance.getCurrentIndex(),
                callback: () =>
                    this.provenance.activateState(action.provenanceId),
            });
        });
        return items;
    }

    render() {
        const provenanceDropdown = () => html`
            <div class="provenance-dropdown">
                <button
                    class="tool-btn"
                    title="Provenance"
                    ?disabled=${this.provenance.isEmpty()}
                    aria-haspopup="menu"
                    aria-expanded="false"
                    @click=${(/** @type {MouseEvent} */ event) => {
                        const opener = /** @type {HTMLElement} */ (
                            event.currentTarget
                        );
                        if (isDropdownOpenFor(opener)) {
                            dismissDropdownMenu();
                        } else {
                            dropdownMenu(
                                {
                                    items: this.#makeHistoryItems(),
                                    mode: "command",
                                    label: "Provenance",
                                },
                                opener
                            );
                        }
                    }}
                >
                    ${icon(faEllipsisH).node[0]}
                </button>
            </div>
        `;

        return html`
            <div
                class="btn-group"
                @click=${(/** @type {MouseEvent} */ e) => e.stopPropagation()}
            >
                <button
                    class="tool-btn"
                    title="Undo (Z)"
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
