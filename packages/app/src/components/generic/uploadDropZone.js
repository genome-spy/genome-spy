import { LitElement, html, css } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { faStyles, formStyles } from "./componentStyles.js";

/**
 * @typedef {CustomEvent<{files: FileList}>} FilesChosenEvent
 */
export default class UploadDropZone extends LitElement {
    static properties = {
        accept: { type: String },
        multiple: { type: Boolean },
        dropText: { type: String },
        _dragOver: { state: true },
    };

    constructor() {
        super();
        this.accept = "";
        this.multiple = false;
        this.dropText = "Drop a file here or";
        this._dragOver = false;
    }

    static styles = [
        formStyles,
        faStyles,
        css`
            .drop-zone {
                border: 2px dashed var(--form-control-border-color);
                border-radius: 8px;
                padding: 1.25rem;
                display: flex;
                align-items: center;
                justify-content: center;
                transition:
                    box-shadow 0.15s ease,
                    transform 0.12s ease,
                    background-color 0.12s ease;
            }

            .drop-zone.drop-over {
                background-color: rgba(106, 160, 255, 0.06);
                border-color: var(--gs-accent-color, #6aa0ff);
                box-shadow: 0 8px 24px rgba(106, 160, 255, 0.08);
            }

            .drop-inner {
                display: flex;
                gap: 1rem;
                align-items: center;
            }

            .drop-icon {
                font-size: 2rem;
            }
        `,
    ];

    render() {
        return html`
            <div
                class=${this._dragOver ? "drop-zone drop-over" : "drop-zone"}
                @dragover=${(/** @type {DragEvent} */ e) => this.#onDragOver(e)}
                @dragleave=${(/** @type {DragEvent} */ e) =>
                    this.#onDragLeave(e)}
                @drop=${(/** @type {DragEvent} */ e) => this.#onDrop(e)}
            >
                <div class="drop-inner">
                    <div class="drop-icon">${icon(faUpload).node[0]}</div>
                    <div class="drop-text">${this.dropText}</div>
                    <button
                        class="btn"
                        @click=${(/** @type {UIEvent} */ evt) => {
                            evt.stopPropagation();
                            this.#fileInput().click();
                        }}
                    >
                        Choose file
                    </button>
                </div>
                <input
                    id="file"
                    type="file"
                    accept=${this.accept}
                    ?multiple=${this.multiple}
                    @change=${(/** @type {UIEvent} */ e) =>
                        this.#onFileChange(e)}
                    style="display: none"
                />
            </div>
        `;
    }

    /**
     * @returns {HTMLInputElement}
     */
    #fileInput() {
        return this.renderRoot.querySelector("#file");
    }

    /**
     * @param {DragEvent} e
     * @returns {void}
     */
    #onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        this._dragOver = true;
    }

    /**
     * @param {DragEvent} e
     * @returns {void}
     */
    #onDragLeave(e) {
        e.preventDefault();
        this._dragOver = false;
    }

    /**
     * @param {DragEvent} e
     * @returns {void}
     */
    #onDrop(e) {
        e.preventDefault();
        this._dragOver = false;
        const dt = e.dataTransfer;

        if (dt.files.length) {
            const files = dt.files;
            this.#emitFiles(files);
        }
    }

    /**
     * @param {Event} e
     * @returns {void}
     */
    #onFileChange(e) {
        const input = /** @type {HTMLInputElement} */ (e.target);
        if (input.files.length) {
            this.#emitFiles(input.files);
        }
    }

    /**
     * @param {FileList} files
     * @returns {void}
     */
    #emitFiles(files) {
        /** @type {FilesChosenEvent} */
        const event = new CustomEvent("gs-files-chosen", {
            detail: { files },
            bubbles: true,
            composed: true,
        });

        this.dispatchEvent(event);
    }
}

customElements.define("gs-upload-drop-zone", UploadDropZone);

export { UploadDropZone as GsUploadDropZone };
