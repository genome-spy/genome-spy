import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/generic/baseDialog.js";
import {
    faBookmark,
    faDownload,
    faShare,
} from "@fortawesome/free-solid-svg-icons";
import { downloadChartPng, embedRenderablePlot } from "./chartDialogUtils.js";
import { showEnterBookmarkInfoDialog } from "../components/dialogs/enterBookmarkDialog.js";
import { showShareBookmarkDialog } from "../components/dialogs/shareBookmarkDialog.js";
import { showMessageDialog } from "../components/generic/messageDialog.js";

/**
 * @typedef {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot} SampleAttributePlot
 *
 * @typedef {import("../bookmark/bookmarkState.js").PlotBookmarkContext} PlotBookmarkContext
 */

/**
 * @param {SampleAttributePlot} plot
 * @returns {import("../bookmark/databaseSchema.d.ts").BookmarkPlotAttachment}
 */
export function createPlotBookmarkAttachment(plot) {
    return {
        kind: "sample_attribute_plot",
        request: plot.request,
    };
}

export class PlotDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        plot: {},
        bookmarkContext: {},
    };

    static styles = [
        ...super.styles,
        css`
            .plot-shell {
                inline-size: min(70vw, 700px);
                block-size: min(60vh, 450px);
                display: flex;
            }

            .chart-container {
                flex: 1;
                min-width: 0;
                min-height: 0;
            }
        `,
    ];

    constructor() {
        super();

        /** @type {SampleAttributePlot | null} */
        this.plot = null;
        /** @type {PlotBookmarkContext | undefined} */
        this.bookmarkContext = undefined;

        /** @type {import("@genome-spy/core/types/embedApi.js").EmbedResult | null} */
        this._api = null;
    }

    connectedCallback() {
        super.connectedCallback();

        this.addEventListener(
            "gs-dialog-closed",
            () => {
                this._api?.finalize();
                this._api = null;
            },
            { once: true }
        );
    }

    firstUpdated() {
        super.firstUpdated?.();
        void this.#initializePlot();
    }

    renderBody() {
        if (!this.plot) {
            return html``;
        }

        return html`<div class="plot-shell">
            <div class="chart-container"></div>
        </div>`;
    }

    renderButtons() {
        if (!this.plot) {
            return [this.makeCloseButton()];
        }

        return [
            this.makeButton(
                "Add bookmark",
                () => {
                    void this.#addBookmark();
                    return true;
                },
                {
                    iconDef: faBookmark,
                    disabled: !this.bookmarkContext?.canSaveLocalBookmark(),
                }
            ),
            this.makeButton(
                "Share",
                () => {
                    void this.#shareBookmark();
                    return true;
                },
                { iconDef: faShare, disabled: !this.bookmarkContext }
            ),
            this.makeButton(
                "Save PNG",
                () => {
                    downloadChartPng(
                        this.renderRoot,
                        this._api,
                        this.plot.filename
                    );
                    return true;
                },
                { iconDef: faDownload }
            ),
            this.makeCloseButton(),
        ];
    }

    async #initializePlot() {
        if (!this.plot) {
            throw new Error("Plot dialog requires a plot.");
        }

        const container = /** @type {HTMLElement} */ (
            this.renderRoot.querySelector(".chart-container")
        );
        if (!container) {
            throw new Error("Cannot find chart container.");
        }

        this._api = await embedRenderablePlot(container, this.plot);
    }

    /**
     * @returns {import("../bookmark/databaseSchema.d.ts").BookmarkEntry}
     */
    #createPlotBookmark() {
        if (!this.bookmarkContext || !this.plot) {
            throw new Error(
                "Plot bookmark creation requires bookmark context and plot."
            );
        }

        return this.bookmarkContext.createBookmark([
            createPlotBookmarkAttachment(this.plot),
        ]);
    }

    async #addBookmark() {
        if (!this.bookmarkContext?.canSaveLocalBookmark()) {
            return;
        }

        const bookmarkDatabase =
            this.bookmarkContext.getLocalBookmarkDatabase();
        const bookmark = this.#createPlotBookmark();
        if (
            await showEnterBookmarkInfoDialog(bookmarkDatabase, bookmark, "add")
        ) {
            try {
                await this.bookmarkContext.saveLocalBookmark(bookmark);
            } catch (error) {
                showMessageDialog(`${error}`, {
                    title: "Cannot save the bookmark!",
                });
            }
        }
    }

    async #shareBookmark() {
        if (!this.bookmarkContext) {
            return;
        }

        const bookmark = this.#createPlotBookmark();
        if (await showEnterBookmarkInfoDialog(undefined, bookmark, "share")) {
            showShareBookmarkDialog(bookmark, false);
        }
    }
}

customElements.define("gs-sample-attribute-plot-dialog", PlotDialog);

/**
 * @param {SampleAttributePlot} plot
 * @param {{ bookmarkContext?: PlotBookmarkContext }} [options]
 * @returns {Promise<import("../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export function showPlotDialog(plot, options = {}) {
    return showDialog("gs-sample-attribute-plot-dialog", (el) => {
        const plotDialog = /** @type {PlotDialog} */ (el);
        plotDialog.plot = plot;
        plotDialog.bookmarkContext = options.bookmarkContext;
        plotDialog.dialogTitle = plot.title;
    });
}

export default showPlotDialog;
