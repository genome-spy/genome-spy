import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/generic/baseDialog.js";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import { downloadChartPng, embedRenderablePlot } from "./chartDialogUtils.js";

/**
 * @typedef {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot} SampleAttributePlot
 */

export class PlotDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        plot: {},
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
}

customElements.define("gs-sample-attribute-plot-dialog", PlotDialog);

/**
 * @param {SampleAttributePlot} plot
 * @returns {Promise<import("../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export function showPlotDialog(plot) {
    return showDialog("gs-sample-attribute-plot-dialog", (el) => {
        const plotDialog = /** @type {PlotDialog} */ (el);
        plotDialog.plot = plot;
        plotDialog.dialogTitle = plot.title;
    });
}

export default showPlotDialog;
