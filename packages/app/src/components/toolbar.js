import { html, LitElement, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faInfoCircle,
    faQuestionCircle,
    faExpandArrowsAlt,
    faArrowsAltV,
} from "@fortawesome/free-solid-svg-icons";
import { findGenomeScaleResolution } from "./searchField";
import { asArray } from "@genome-spy/core/utils/arrayUtils";
import bowtie from "@genome-spy/core/img/bowtie.svg";
import { messageBox } from "../utils/ui/modal";

import "./viewSettingsButton";
import "./provenanceToolbar";
import "./bookmarkButton";

export default class Toolbar extends LitElement {
    constructor() {
        super();

        /** @type {import("../app").default} */
        this.app = undefined;

        /** Just to signal (and re-render) once GenomeSpy has been launched */
        this.appInitialized = false;
    }

    static get properties() {
        return {
            app: { type: Object },
            appInitialized: { type: Boolean },
        };
    }

    createRenderRoot() {
        return this;
    }

    _getToolButtons() {
        const sampleView = this.app.getSampleView();
        const provenance = this.app.provenance;

        /** @type {(import("lit").TemplateResult | string)[]} */
        const elements = [];

        // Check that there's an undoable state
        if (provenance.isEnabled()) {
            elements.push(
                html`
                    <genome-spy-provenance-buttons
                        .provenance=${provenance}
                    ></genome-spy-provenance-buttons>
                `
            );
        }

        elements.push(
            html`<genome-spy-view-visibility></genome-spy-view-visibility>`
        );

        if (sampleView) {
            elements.push(html`
                <button
                    class="tool-btn"
                    title="Peek (E)"
                    @click=${() => sampleView._togglePeek()}
                >
                    ${icon(faArrowsAltV).node[0]}
                </button>
            `);
        }

        elements.push(html`
            <genome-spy-bookmark-button></genome-spy-bookmark-button>
        `);

        /**
         * The first entry in the description array is shown as a title in the toolbar
         */

        const description = this.app.config.description
            ? asArray(this.app.config.description)
            : [];

        if (description.length > 1) {
            elements.push(html`
                <button
                    class="tool-btn"
                    title="Show a description of the visualization"
                    @click=${() =>
                        messageBox(
                            html`${description
                                .slice(1)
                                .map((line) => html`<p>${line}</p>`)}`,
                            description[0]
                        )}
                >
                    ${icon(faInfoCircle).node[0]}
                </button>
            `);
        }

        if (description.length > 0) {
            elements.push(html`
                <span class="vis-title">${description[0]}</span>
            `);
        }

        elements.push(html`
            <span class="spacer"></span>

            <button
                class="tool-btn"
                title="Fullscreen"
                @click=${() => this.app.toggleFullScreen()}
            >
                ${icon(faExpandArrowsAlt).node[0]}
            </button>

            <button
                class="tool-btn"
                title="Help"
                @click=${() =>
                    window.open("https://genomespy.app/docs/", "_blank")}
            >
                ${icon(faQuestionCircle).node[0]}
            </button>
        `);

        return elements;
    }

    render() {
        const genomeSpy = this.app.genomeSpy;

        return html`
            <nav class="gs-toolbar">
                <a href="https://genomespy.app" target="_blank" class="logo">
                    <img title="GenomeSpy" alt="GenomeSpy" src="${bowtie}" />
                </a>
                <div class="title">
                    <span>GenomeSpy</span>
                </div>

                ${this.appInitialized &&
                findGenomeScaleResolution(genomeSpy.viewRoot)
                    ? html`
                          <genome-spy-search-field
                              .genomeSpy=${genomeSpy}
                          ></genome-spy-search-field>
                      `
                    : nothing}
                ${this._getToolButtons()}
            </nav>
        `;
    }
}

customElements.define("genome-spy-toolbar", Toolbar);
