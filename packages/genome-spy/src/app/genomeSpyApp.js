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
import { zoomLinear } from "vega-util";
import { SampleAttributePanel } from "../view/sampleView/sampleAttributePanel";
import getBookmarkButtons from "../sampleHandler/bookmarkToolbar";
import BookmarkDatabase from "../sampleHandler/bookmarkDatabase";
import { asArray } from "../utils/arrayUtils";
import { sampleIterable } from "../data/transforms/sample";
import { debounce } from "../utils/debounce";

import "../sampleHandler/provenanceToolbar-wc";

/**
 * A simple wrapper for the GenomeSpy component.
 *
 * TODO: Not so simple anymore. Split into components. Use haunted or lit-element.
 */
export default class GenomeSpyApp {
    /**
     *
     * @param {HTMLElement} appContainerElement
     * @param {import("../spec/view").RootSpec} config
     */
    constructor(appContainerElement, config) {
        this.config = config;

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

        function getSearchHelp() {
            /** @type {import("lit").TemplateResult[]} */
            const parts = [];

            parts.push(html`
                <p>Focus to a specific range. Examples:</p>
                <ul>
                    <!-- TODO: Display only when using a genomic coordinate system-->
                    <li>chr8:21,445,873-24,623,697</li>
                    <li>chr4:166,014,727-chr15:23,731,397</li>
                </ul>
            `);

            for (const view of self.genomeSpy.getSearchableViews()) {
                const viewTitle = view.spec.title ?? view.spec.name;
                const a = view.getAccessor("search");
                const fieldString = a.fields.join(", "); // TODO: Field title

                const examples = sampleIterable(
                    3,
                    view.getCollector().getData(),
                    a
                );

                parts.push(html`
                    <p>
                        Search <em>${viewTitle}</em> (${fieldString}). Examples:
                    </p>
                    <ul>
                        ${examples.map(
                            example =>
                                html`
                                    <li>${example}</li>
                                `
                        )}
                    </ul>
                `);
            }

            return html`
                <div class="search-help" @click=${onSearchHelpClicked}>
                    ${parts}
                </div>
            `;
        }

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
                elements.push(
                    getBookmarkButtons(sampleHandler, bookmarkDatabase, () =>
                        self._renderTemplate()
                    )
                );
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

        function getSearchField() {
            if (!self.getFormattedDomain) {
                return nothing;
            }

            return html`
                <div class="search">
                    <input
                        type="text"
                        class="search-input"
                        value=${self.getFormattedDomain()}
                        @keydown=${onSearchKeyDown}
                        @focus=${onSearchFocused}
                    />
                    ${getSearchHelp()}
                </div>
            `;
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
                    ${getTitle()} ${getSearchField()} ${getToolButtons()}
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

        /**
         *
         * @param {MouseEvent} event
         */
        function onSearchHelpClicked(event) {
            const element = /** @type {HTMLElement} */ (event.target);
            if (element.tagName == "LI") {
                doExampleSearch(element.innerText);
            }
        }

        /** @param {FocusEvent} event */
        function onSearchFocused(event) {
            const searchInput = /** @type {HTMLInputElement} */ (event.target);
            searchInput.select();

            // TODO: Fix, position the help nicely just below the toolbar etc
            //searchHelp.style.width = searchInput.offsetWidth + "px";
            //searchHelp.style.top = toolbar.offsetHeight + "px";
        }

        /**
         *
         * @param {KeyboardEvent} event
         */
        function onSearchKeyDown(event) {
            const searchInput = /** @type {HTMLInputElement} */ (event.target);
            if (event.keyCode == 13) {
                event.preventDefault();

                self.search(searchInput.value)
                    .then(() => {
                        searchInput.focus();
                        searchInput.select();
                    })
                    .catch(reason => {
                        console.log(reason);
                        alert(reason);
                    });
            } else if (event.keyCode == 27) {
                searchInput.blur();
            } else {
                event.stopPropagation();
            }
        }

        /**
         *
         * @param {string} term
         */
        function doExampleSearch(term) {
            const searchInput = /** @type {HTMLInputElement} */ (elem(
                "search-input"
            ));
            typeSlowly(term, searchInput).then(() => {
                searchInput.blur();
                self.search(term);
            });
        }

        this._renderTemplate();

        // TODO: Implement a centralized shortcut handler
        document.addEventListener("keydown", event => {
            switch (event.code) {
                case "KeyF":
                    if (!(event.metaKey || event.altKey || event.ctrlKey)) {
                        event.preventDefault();
                        elem("search-input").focus();
                    }
                    break;
                case "Backspace":
                case "KeyB":
                    break;
                default:
            }
        });

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

        const title = asArray(this.genomeSpy.config.description ?? []);

        if (this.isFullPage() && title.length > 0) {
            document.title = "GenomeSpy - " + title;
        }

        this._initializeGenome();
        this._replayProvenanceFromUrl();
        // Update the UI now that GenomeSpy is initialized
        this._renderTemplate();

        this.getSampleHandler()?.provenance.addListener(() => {
            this._updateUrl();
        });
    }

    _initializeGenome() {
        const genomeResolution = this.findGenomeScaleResolution();
        if (genomeResolution) {
            this._genomeResolution = genomeResolution;
            this._genome = this.genomeSpy.genomeStore.getGenome();

            this.getFormattedDomain = () =>
                this._genome.formatInterval(
                    genomeResolution.getScale().domain()
                );

            const elem = /** @param {string} className */ className =>
                /** @type {HTMLElement} */ (this.appContainer.getElementsByClassName(
                    className
                )[0]);

            const updateInput = () => {
                // Could just call _renderTemplate here, but this is very likely more efficient
                /** @type {HTMLInputElement} */ (elem(
                    "search-input"
                )).value = this.getFormattedDomain();
            };

            genomeResolution.addScaleObserver(debounce(updateInput, 60, false));
        }
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

    /**
     * Finds a scale resolution that has a zoomable locus scale
     */
    findGenomeScaleResolution() {
        /** @type {import("../view/scaleResolution").default} */
        let match;

        this.genomeSpy.viewRoot.visit(view => {
            for (const channel of ["x", "y"]) {
                const resolution = view.resolutions.scale[channel];
                if (
                    resolution &&
                    resolution.type == "locus" &&
                    resolution.isZoomable()
                ) {
                    match = resolution;
                    return VISIT_STOP;
                }
            }
        });

        return match;
    }

    /**
     * @param {string} term
     */
    searchViews(term) {
        const collator = new Intl.Collator("en", {
            usage: "search",
            sensitivity: "base"
        });
        for (const view of this.genomeSpy.getSearchableViews()) {
            const sa = view.getAccessor("search");

            const xa = view.getAccessor("x");
            const x2a = view.getAccessor("x2");
            const xResolution = view.getScaleResolution("x");

            // TODO: y

            if (!xa || !x2a || !xResolution?.isZoomable()) {
                continue;
            }

            for (const d of view.getCollector()?.getData()) {
                if (collator.compare(sa(d), term) === 0) {
                    const interval = zoomLinear([xa(d), x2a(d)], null, 1.2);
                    xResolution.zoomTo(interval);
                    view.context.animator.requestRender();
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * @param {string} term
     */
    // eslint-disable-next-line require-await
    async search(term) {
        if (this._genomeResolution && this._genome) {
            const interval = this._genome.parseInterval(term);
            if (interval) {
                this._genomeResolution.zoomTo(interval);
                this.genomeSpy.animator.requestRender();
                return;
            }
        }

        if (this.searchViews(term)) {
            return;
        }

        this.genomeSpy.viewRoot.visit(view => {
            if (view instanceof SampleAttributePanel) {
                view.handleVerboseCommand(term);
            }
        });
    }
}

/**
 *
 * @param {string} text
 * @param {HTMLInputElement} element
 */
function typeSlowly(text, element) {
    return new Promise(resolve => {
        let i = 0;
        const delay = 700 / text.length + 30;

        function next() {
            element.value = text.substring(0, i);

            if (i >= text.length) {
                setTimeout(resolve, 500);
            } else {
                i++;
                setTimeout(next, Math.random() * delay * 2);
            }
        }

        next();
    });
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
