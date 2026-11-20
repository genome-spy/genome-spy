import { LitElement, html, css } from "lit";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { faStyles, renderIcon } from "./icon.js";

/**
 * @typedef {import("./filePicker.js").FilesChosenEvent} FilesChosenEvent
 */

/**
 * Accept local files from a drop or the built-in picker. Validate both paths
 * before reading the files.
 *
 * @tag gs-upload-drop-zone
 * @fires {FilesChosenEvent} gs-files-chosen - Bubbles across shadow roots with a FileList in `detail.files`.
 * @csspart drop-zone - Surface that receives file drops.
 * @csspart picker-button - Button inside the nested file picker.
 * @cssprop --gs-control-border - Drop surface border.
 * @cssprop --gs-drop-zone-radius - Drop surface corner radius.
 * @cssprop --gs-drop-zone-active-background - Fill during a drag.
 * @cssprop --gs-accent-color - Border color during a drag. Falls back to the theme accent.
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
        /** Extensions or MIME types offered by the picker. Validate dropped files in the caller. */
        this.accept = "";
        /** Allow multiple files in the picker. Drops can contain multiple files independently. */
        this.multiple = false;
        /** Prompt next to the file picker. */
        this.dropText = "Drop a file here or";
        this._dragOver = false;
    }

    static styles = [
        faStyles,
        css`
            :host {
                display: block;
                font-size: inherit;
                font-family: inherit;
            }

            .drop-zone {
                border: 2px dashed var(--gs-control-border, #ced4da);
                border-radius: var(--gs-drop-zone-radius, 8px);
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
                background-color: var(
                    --gs-drop-zone-active-background,
                    rgba(106, 160, 255, 0.06)
                );
                border-color: var(
                    --gs-accent-color,
                    var(--gs-theme-primary, #6aa0ff)
                );
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

    /** @returns {import("lit").HTMLTemplateResult} */
    render() {
        return html`
            <div
                part="drop-zone"
                class=${this._dragOver ? "drop-zone drop-over" : "drop-zone"}
                @dragover=${(/** @type {DragEvent} */ e) => this.#onDragOver(e)}
                @dragleave=${(/** @type {DragEvent} */ e) =>
                    this.#onDragLeave(e)}
                @drop=${(/** @type {DragEvent} */ e) => this.#onDrop(e)}
            >
                <div class="drop-inner">
                    <div class="drop-icon">${renderIcon(faUpload)}</div>
                    <div class="drop-text">${this.dropText}</div>
                    <gs-file-picker
                        .accept=${this.accept}
                        .multiple=${this.multiple}
                        exportparts="button: picker-button"
                        >Choose file</gs-file-picker
                    >
                </div>
            </div>
        `;
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
