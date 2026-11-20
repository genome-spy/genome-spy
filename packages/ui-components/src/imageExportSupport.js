import { css, html, nothing } from "lit";
import BaseDialog from "./dialog.js";

/**
 * @typedef {{logicalWidth: number, logicalHeight: number}} ExportDimensions
 */

/**
 * @typedef {ExportDimensions & {
 *     pixelRatio: number,
 *     mimeType: "image/png",
 *     background?: string | null,
 * }} PngExportOptions
 */

/**
 * @typedef {ExportDimensions & {
 *     rasterization?: {maxVectorInstances: number, pixelRatio: number},
 * }} SvgExportOptions
 */

/**
 * @typedef {{
 *     viewTitle?: string,
 *     viewPath: string,
 *     markType: string,
 *     instanceCount: number,
 * }} SvgExportLayer
 */

/**
 * @typedef {{
 *     getLogicalCanvasSize: () => {width: number, height: number},
 * }} SizedSource
 */

/**
 * @typedef {SizedSource & {
 *     imageExport: {
 *         raster: (options: PngExportOptions) => Promise<{blob: Blob}>,
 *     },
 * }} PngExportSource
 */

/**
 * @typedef {SizedSource & {
 *     imageExport: {
 *         svg: (options: SvgExportOptions) => Promise<{blob: Blob, warnings: string[], rasterized?: readonly unknown[]}>,
 *         analyzeSvg: (options: ExportDimensions) => Promise<{layers: SvgExportLayer[]}>,
 *     },
 * }} SvgExportSource
 */

/** @template {SizedSource} Source */
export default class ImageExportDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        source: { attribute: false },
        filename: { type: String },
        _saving: { state: true },
        _exportError: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                box-sizing: border-box;
                width: min(500px, calc(100vw - 24px));
                min-width: 0;
                max-height: calc(100dvh - 24px);
            }
        `,
    ];

    constructor() {
        super();

        /** @type {Source | undefined} Source supplying the current visualization and export callbacks. */
        this.source = undefined;
        /** Suggested name for the downloaded file. */
        this.filename = "";
        this._saving = false;
        this._exportError = "";
        this.addEventListener("gs-dialog-closed", (event) => {
            if (
                event.composedPath()[0] === this &&
                !this.renderRoot.querySelector("dialog")?.open
            ) {
                this.resetSession();
            }
        });
    }

    /** @protected @type {{source: Source} | undefined} */
    session;

    /** Open a mounted dialog. Set openOnConnect to false to open it on demand. */
    async show() {
        await this.updateComplete;
        if (this.isConnected) {
            this.openDialog();
        }
    }

    openDialog() {
        if (!this.source || this.renderRoot.querySelector("dialog")?.open) {
            return;
        }

        this.session = { source: this.source };
        this._exportError = "";
        super.openDialog();
        this.onExportOpen(this.source);
    }

    /** @param {import("lit").PropertyValues} changed */
    updated(changed) {
        super.updated(changed);
        if (
            changed.has("source") &&
            this.session &&
            this.source !== this.session.source
        ) {
            this.finish({ ok: false, reason: "source-changed" });
            this.triggerClose();
        }
    }

    triggerClose() {
        this.resetSession();
        super.triggerClose();
    }

    disconnectedCallback() {
        this.resetSession();
        super.disconnectedCallback();
    }

    /** @protected */
    resetSession() {
        this.session = undefined;
        this._saving = false;
    }

    /**
     * @param {Source} source
     * @protected
     */
    onExportOpen(source) {}

    /**
     * @param {{source: Source} | undefined} session
     * @protected
     */
    isCurrentSession(session) {
        return (
            this.isConnected &&
            !!session &&
            this.session === session &&
            this.source === session.source &&
            this.renderRoot.querySelector("dialog")?.open === true
        );
    }

    /**
     * @protected
     * @returns {import("lit").HTMLTemplateResult | typeof nothing}
     */
    renderExportError() {
        return this._exportError
            ? html`<div class="gs-alert danger" role="alert">
                  ${this._exportError}
              </div>`
            : nothing;
    }

    /**
     * @param {(source: Source) => Promise<{blob: Blob, data?: unknown}>} exportFile
     * @protected
     * @returns {Promise<boolean>} Whether to keep the dialog open.
     */
    async download(exportFile) {
        const session = this.session;
        if (!this.isCurrentSession(session) || this._saving) {
            return true;
        }

        this._saving = true;
        this._exportError = "";
        try {
            const { blob, data } = await exportFile(session.source);
            if (!this.isCurrentSession(session)) {
                return true;
            }
            const href = await blobToDataUrl(blob);
            if (!this.isCurrentSession(session)) {
                return true;
            }

            const link = this.ownerDocument.createElement("a");
            link.href = href;
            link.download = this.filename;
            this.ownerDocument.body.appendChild(link);
            try {
                link.click();
            } finally {
                link.remove();
            }
            this.finish({ ok: true, data });
            return false;
        } catch (error) {
            if (this.isCurrentSession(session)) {
                this._exportError =
                    error instanceof Error ? error.message : String(error);
            }
            return true;
        } finally {
            if (this.isCurrentSession(session)) {
                this._saving = false;
            }
        }
    }
}

/**
 * Data URLs are used for consistency with App and Playground downloads.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(String(reader.result)));
        reader.addEventListener("error", () => reject(reader.error));
        reader.readAsDataURL(blob);
    });
}

/** @param {(input: HTMLInputElement) => void} callback */
export function inputListener(callback) {
    return (/** @type {Event} */ event) =>
        callback(/** @type {HTMLInputElement} */ (event.currentTarget));
}
