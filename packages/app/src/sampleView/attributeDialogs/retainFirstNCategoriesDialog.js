import { icon } from "@fortawesome/fontawesome-svg-core";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { html, render } from "lit";
import { createModal } from "../../utils/ui/modal.js";

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export default function retainFirstNCategoriesDialog(
    attributeInfo,
    sampleView
) {
    let n = 5;

    const modal = createModal();

    const templateTitle = html`
        <div class="modal-title">
            Retain first n categories of <em>${attributeInfo.title}</em>
        </div>
    `;

    const dispatchAndClose = (/** @type {boolean} */ remove) => {
        sampleView.dispatchAttributeAction(
            sampleView.actions.retainFirstNCategories({
                attribute: attributeInfo.attribute,
                n,
            })
        );
        modal.close();
    };

    const templateButtons = () =>
        html` <div class="modal-buttons">
            <button class="btn btn-cancel" @click=${() => modal.close()}>
                Cancel
            </button>

            <button
                class="btn btn-primary"
                @click=${() => dispatchAndClose(false)}
            >
                ${icon(faFilter).node[0]} Retain
            </button>
        </div>`;

    const template = html`
        <div class="gs-form-group">
            <label>Number of categories to retain:</label>
            <input
                type="number"
                min="1"
                .valueAsNumber=${n}
                @change=${(/** @type {UIEvent} */ event) => {
                    n = /** @type {HTMLInputElement} */ (event.target)
                        .valueAsNumber;
                }}
            />
        </div>
    `;

    function updateHtml() {
        render(
            html`${templateTitle}
                <div class="modal-body">${template}</div>
                ${templateButtons()}`,
            modal.content
        );
    }

    updateHtml();

    modal.content.querySelector("input").focus();
}
