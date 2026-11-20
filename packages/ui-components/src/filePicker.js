import { LitElement, css, html } from "lit";

/** @typedef {CustomEvent<{files: FileList}>} FilesChosenEvent */

/**
 * Choose local files through a native input. The caller reads and validates them.
 *
 * @tag gs-file-picker
 * @slot - Button label. Defaults to “Choose files”.
 * @fires {FilesChosenEvent} gs-files-chosen - Bubbles across shadow roots with a FileList in `detail.files`.
 * @csspart button - Native button that opens the picker.
 * @cssprop --gs-file-picker-background - Picker button fill. Falls back to the shared button fill.
 * @cssprop --gs-file-picker-hover - Picker hover fill.
 * @cssprop --gs-file-picker-padding - Picker button padding.
 */
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
            background: var(
                --gs-file-picker-background,
                var(--gs-button-background, #fff)
            );
            box-shadow: var(--gs-button-shadow, none);
            cursor: pointer;
        }

        button:hover {
            background: var(
                --gs-file-picker-hover,
                var(
                    --gs-button-hover-background,
                    var(
                        --gs-hover-background,
                        var(
                            --gs-file-picker-background,
                            var(--gs-button-background, #f0f2f4)
                        )
                    )
                )
            );
        }

        button:active {
            background: var(
                --gs-button-selected-background,
                var(--gs-selected-background, #dfe5eb)
            );
            box-shadow: var(--gs-button-selected-shadow, none);
        }

        button:focus-visible {
            outline: 2px solid var(--gs-focus-color, currentColor);
            outline-offset: 2px;
        }
    `;

    constructor() {
        super();
        /** Comma-separated extensions or MIME types passed to the native picker. */
        this.accept = "";
        /** Allow choosing more than one file. */
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

    /** @returns {import("lit").HTMLTemplateResult} */
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
