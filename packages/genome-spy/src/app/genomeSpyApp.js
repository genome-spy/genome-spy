import lzString from "lz-string";

import GenomeSpy from "../genomeSpy";
import "../styles/genome-spy-app.scss";
import favIcon from "../img/genomespy-favicon.svg";
import bowtie from "../img/bowtie.svg";
import { html, render, nothing } from "lit";

import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faInfoCircle,
    faQuestionCircle,
    faExpandArrowsAlt,
    faArrowsAltV
} from "@fortawesome/free-solid-svg-icons";
import { VISIT_STOP } from "../view/view";
import SampleView from "../view/sampleView/sampleView";
import BookmarkDatabase from "../sampleHandler/bookmarkDatabase";
import { asArray } from "../utils/arrayUtils";

import "../sampleHandler/provenanceToolbar-wc";
import { findGenomeScaleResolution } from "./searchField-wc";
import "../sampleHandler/bookmarkButton-wc";

/**
 * A simple wrapper for the GenomeSpy core.
 */
export default class GenomeSpyApp {
    /**
     *
     * @param {HTMLElement} appContainerElement
     * @param {import("../spec/view").RootSpec} config
     */
    constructor(appContainerElement, config) {
        this.config = config;

        this.launched = false;

        this.appContainer = appContainerElement;
        if (this.isFullPage()) {
            this.appContainer.style.margin = "0";
            this.appContainer.style.padding = "0";
            this.appContainer.style.overflow = "hidden";

            setFavicon(favIcon);
        } else {
            this.appContainer.style.position = "relative";
        }

        // eslint-disable-next-line consistent-this
        const self = this;

        const bookmarkDatabase =
            typeof config.specId == "string"
                ? new BookmarkDatabase(config.specId)
                : undefined;

        /**
         * The first entry in the description array is shown as a title in the toolbar
         * @type {string[]}
         */
        const description = self.config.description
            ? asArray(self.config.description)
            : [];

        this._renderTemplate = () => {
            render(getAppBody(), self.appContainer);
        };

        function getToolButtons() {
            const sampleHandler = self.getSampleHandler();
            const provenance = sampleHandler?.provenance;

            /** @type {(import("lit").TemplateResult | string)[]} */
            const elements = [];

            if (provenance) {
                elements.push(
                    html`
                        <genome-spy-provenance-buttons
                            .provenance=${provenance}
                        />
                    `
                );
            }

            if (sampleHandler) {
                elements.push(html`
                    <button
                        class="tool-btn"
                        title="Peek (E)"
                        @click=${() => self.getSampleView()._togglePeek()}
                    >
                        ${icon(faArrowsAltV).node[0]}
                    </button>
                `);
            }

            if (sampleHandler && bookmarkDatabase) {
                elements.push(html`
                    <genome-spy-bookmark-button
                        .sampleHandler=${sampleHandler}
                        .bookmarkDatabase=${bookmarkDatabase}
                    ></genome-spy-bookmark-button>
                `);
            }

            if (description.length > 1) {
                elements.push(html`
                    <button
                        class="tool-btn"
                        title="Show a description of the visualization"
                        @click=${() => alert(description.join("\n"))}
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
                    @click=${() => self.toggleFullScreen()}
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

        function getTitle() {
            return html`
                <a href="https://genomespy.app" target="_blank" class="logo">
                    <img title="GenomeSpy" alt="GenomeSpy" src="${bowtie}" />
                </a>
                <div class="title">
                    <span>GenomeSpy</span>
                </div>
            `;
        }

        function getToolbar() {
            return html`
                <nav class="toolbar">
                    ${getTitle()}
                    ${self.launched &&
                    findGenomeScaleResolution(self.genomeSpy.viewRoot)
                        ? html`
                              <genome-spy-search-field
                                  .genomeSpy=${self.genomeSpy}
                              ></genome-spy-search-field>
                          `
                        : nothing}
                    ${getToolButtons()}
                </nav>
            `;
        }

        function getAppBody() {
            return html`
                <div class="genome-spy-app">
                    ${getToolbar()}
                    <div class="genome-spy-container"></div>
                </div>
            `;
        }

        /** @param {string} className */
        const elem = className =>
            /** @type {HTMLElement} */ (this.appContainer.getElementsByClassName(
                className
            )[0]);

        this._renderTemplate();

        elem("genome-spy-container").addEventListener("click", event => {
            elem("search-input").blur();
        });

        this.genomeSpy = new GenomeSpy(
            elem("genome-spy-container"),
            this.config
        );
    }

    toggleFullScreen() {
        if (!document.fullscreenElement) {
            this.appContainer.requestFullscreen();
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }

    isFullPage() {
        return this.appContainer == document.body;
    }

    async launch() {
        const result = await this.genomeSpy.launch();
        if (!result) {
            return;
        }
        this.launched = true;

        const title = asArray(this.genomeSpy.config.description ?? []);

        if (this.isFullPage() && title.length > 0) {
            document.title = "GenomeSpy - " + title;
        }

        this._replayProvenanceFromUrl();

        // Update the UI now that GenomeSpy is initialized
        this._renderTemplate();

        this.getSampleHandler()?.provenance.addListener(() => {
            this._updateUrl();
        });
    }

    /**
     * Update provenance to url
     */
    _updateUrl() {
        const history = this.getSampleHandler().provenance.getActionHistory();

        let hash = "";
        if (history.length) {
            hash =
                "#" +
                lzString.compressToEncodedURIComponent(JSON.stringify(history));
        }

        window.history.replaceState(
            undefined,
            document.title,
            window.location.pathname + window.location.search + hash
        );
    }

    _replayProvenanceFromUrl() {
        if (!this.getSampleHandler()) {
            return;
        }

        const hash = window.location.hash;
        if (hash && hash.length > 0) {
            const history = JSON.parse(
                lzString.decompressFromEncodedURIComponent(hash.substr(1))
            );

            if (Array.isArray(history)) {
                this.getSampleHandler().dispatchBatch(history);
            }
        }
    }

    /**
     *
     * @param {object} config
     */
    async updateConfig(config) {
        this.config = config;
        // TODO: Preserve viewport
        this.genomeSpy.destroy();
        await this.launch();
    }

    getSampleView() {
        if (!this.genomeSpy?.viewRoot) {
            return;
        }

        /** @type {import("../view/sampleView/sampleView").default} */
        let sampleView;

        this.genomeSpy.viewRoot.visit(view => {
            if (view instanceof SampleView) {
                sampleView = view;
                return VISIT_STOP;
            }
        });

        return sampleView;
    }

    getSampleHandler() {
        return this.getSampleView()?.sampleHandler;
    }
}

/**
 * https://spemer.com/articles/set-favicon-with-javascript.html
 *
 * @param {string} favImg
 */
function setFavicon(favImg) {
    let headTitle = document.querySelector("head");
    let setFavicon = document.createElement("link");
    setFavicon.setAttribute("rel", "shortcut icon");
    setFavicon.setAttribute("href", favImg);
    headTitle.appendChild(setFavicon);
}
