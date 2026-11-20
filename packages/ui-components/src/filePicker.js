import { LitElement, css, html } from "lit";

/** @typedef {CustomEvent<{files: FileList}>} FilesChosenEvent */

/** Choose files through a native input. The caller owns validation and reading. */
export default class FilePicker extends LitElement {
    static properties = {
        accept: { type: String },
        multiple: { type: Boolean },
    };

    static styles = css`
        button {
            font: inherit;
            color: var(--gs-control-text, inherit);
            padding: var(--gs-file-picker-padding, 4px 12px);
            border: 1px solid var(--gs-control-border, #b3b3b3);
            border-radius: var(--gs-control-radius, 4px);
            background: var(--gs-file-picker-background, white);
            cursor: pointer;
        }

        button:hover {
            background: var(--gs-file-picker-hover, #f0f0f0);
        }

        button:focus-visible {
            outline: 2px solid var(--gs-focus-color, currentColor);
            outline-offset: 2px;
        }
    `;

    constructor() {
        super();
        this.accept = "";
        this.multiple = false;
    }

    /** Open the picker from a user gesture. */
    openPicker() {
        this.renderRoot.querySelector("input").click();
    }

    /** @param {FocusOptions} [options] */
    focus(options) {
        this.renderRoot.querySelector("button").focus(options);
    }

    /** @param {Event} event */
    #onChange(event) {
        const input = /** @type {HTMLInputElement} */ (event.currentTarget);
        if (input.files.length) {
            this.dispatchEvent(
                new CustomEvent("gs-files-chosen", {
                    detail: { files: input.files },
                    bubbles: true,
                    composed: true,
                })
            );
        }
        // Choosing the same file again must dispatch another change event.
        input.value = "";
    }

    render() {
        return html`
            <button type="button" part="button" @click=${this.openPicker}>
                <slot>Choose files</slot>
            </button>
            <input
                id="file-input"
                type="file"
                hidden
                accept=${this.accept}
                ?multiple=${this.multiple}
                @change=${this.#onChange}
            />
        `;
    }
}
