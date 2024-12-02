import { html, LitElement, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faInfoCircle,
    faQuestionCircle,
    faExpandArrowsAlt,
    faBug,
} from "@fortawesome/free-solid-svg-icons";
import { findGenomeScaleResolution } from "./searchField.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";
import bowtie from "@genome-spy/core/img/bowtie.svg";
import { messageBox } from "../utils/ui/modal.js";

import packageJson from "../../package.json";

import "./viewSettingsButton.js";
import "./provenanceToolbar.js";
import "./bookmarkButton.js";
import { showDataflowInspectorDialog } from "../dataflowInspector.js";

export default class Toolbar extends LitElement {
    constructor() {
        super();

        /** @type {import("../app.js").default} */
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
        const provenance = this.app.provenance;

        /** @type {(import("lit").TemplateResult | string)[]} */
        const elements = [];

        // Check that there's an undoable state
        if (provenance.isEnabled()) {
            elements.push(html`
                <genome-spy-provenance-buttons
                    .provenance=${provenance}
                ></genome-spy-provenance-buttons>
            `);
        }

        elements.push(
            html`<genome-spy-view-visibility></genome-spy-view-visibility>`
        );

        elements.push(html`
            <genome-spy-bookmark-button></genome-spy-bookmark-button>
        `);

        /**
         * The first entry in the description array is shown as a title in the toolbar
         */

        const description = this.app.rootSpec.description
            ? asArray(this.app.rootSpec.description)
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
                            { title: description[0] }
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

            <a
                class="version"
                href="https://github.com/genome-spy/genome-spy/releases/tag/v${packageJson.version}"
                >v${packageJson.version}</a
            >

            ${this.app.options.showInspectorButton
                ? html` <button
                      class="tool-btn"
                      title="Dataflow Inspector"
                      @click=${() =>
                          showDataflowInspectorDialog(
                              this.app.genomeSpy.viewRoot.context.dataFlow,
                              {
                                  highlightView:
                                      this.app.genomeSpy.viewRoot.context
                                          .highlightView,
                              }
                          )}
                  >
                      ${icon(faBug).node[0]}
                  </button>`
                : nothing}
            ${this.app.appContainer.requestFullscreen
                ? html`
                      <button
                          class="tool-btn"
                          title="Fullscreen"
                          @click=${() => this.app.toggleFullScreen()}
                      >
                          ${icon(faExpandArrowsAlt).node[0]}
                      </button>
                  `
                : nothing}

            <button
                class="tool-btn"
                title="Help"
                @click=${() =>
                    window.open(
                        "https://genomespy.app/docs/sample-collections/analyzing/",
                        "_blank"
                    )}
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

                ${this.appInitialized &&
                findGenomeScaleResolution(genomeSpy.viewRoot)
                    ? html`
                          <genome-spy-search-field
                              .app=${this.app}
                          ></genome-spy-search-field>
                      `
                    : nothing}
                ${this._getToolButtons()}
            </nav>
        `;
    }
}

customElements.define("genome-spy-toolbar", Toolbar);
