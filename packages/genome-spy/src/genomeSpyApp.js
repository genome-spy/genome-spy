import lzString from "lz-string";

import GenomeSpy from "./genomeSpy";
import "./styles/genome-spy-app.scss";
import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";

import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faUndo,
    faRedo,
    faBookmark,
    faFish,
    faArrowsAltV,
    faInfoCircle,
    faQuestionCircle
} from "@fortawesome/free-solid-svg-icons";
import { VISIT_STOP } from "./view/view";
import SampleView from "./view/sampleView/sampleView";

/**
 * A simple wrapper for the GenomeSpy component.
 */
export default class GenomeSpyApp {
    /**
     *
     * @param {HTMLElement} appContainerElement
     * @param {Object} config
     */
    constructor(appContainerElement, config) {
        this.config = config;

        this.appContainer = appContainerElement;
        if (this.appContainer == document.body) {
            this.appContainer.style.margin = "0";
            this.appContainer.style.padding = "0";
        } else {
            this.appContainer.style.position = "relative";
        }

        const self = this;

        function getSearchHelp() {
            return html`
                <div class="search-help" @click=${onSearchHelpClicked}>
                    <p>Focus to a specific range. Examples:</p>
                    <ul>
                        <!-- TODO: Display only when using a genomic coordinate system-->
                        <li>chr8:21,445,873-24,623,697</li>
                        <li>chr4:166,014,727-chr15:23,731,397</li>
                    </ul>

                    ${/*unsafeHTML(
                        (self.genomeSpy
                            ? self.genomeSpy.tracks.map(t => t.searchHelp())
                            : []
                        ).join("")
                        )*/ ""}
                </div>
            `;
        }

        function getToolButtons() {
            const provenance = self.getSampleHandler()?.provenance;

            const sampleButtons = provenance
                ? html`
                      <button
                          class="tool-btn backtrack-samples"
                          title="Backtrack samples (B)"
                          ?disabled=${!provenance.isUndoable()}
                          @click=${() => provenance.undo()}
                      >
                          ${icon(faUndo).node[0]}
                      </button>
                      <button
                          class="tool-btn"
                          title="Redo"
                          ?disabled=${!provenance.isRedoable()}
                          @click=${() => provenance.redo()}
                      >
                          ${icon(faRedo).node[0]}
                      </button>
                      <button
                          class="tool-btn"
                          title="Bookmark"
                          ?disabled=${provenance.isAtInitialState()}
                          @click=${() =>
                              console.log(
                                  JSON.stringify(provenance.getActionHistory())
                              )}
                      >
                          ${icon(faBookmark).node[0]}
                      </button>
                  `
                : "";

            return html`
                ${sampleButtons}

                <button
                    class="tool-btn"
                    title="Info"
                    @click=${() => alert("TODO")}
                >
                    ${icon(faInfoCircle).node[0]}
                </button>

                ${self.genomeSpy && self.genomeSpy.config.title
                    ? html`
                          <span class="vis-title"
                              >${self.genomeSpy.config.title}</span
                          >
                      `
                    : ""}

                <span class="spacer"></span>

                <button
                    class="tool-btn"
                    title="Help"
                    @click=${() =>
                        window.open("https://genomespy.app/docs/", "_blank")}
                >
                    ${icon(faQuestionCircle).node[0]}
                </button>
            `;
        }

        function getToolbar() {
            return html`
                <nav class="toolbar">
                    <div class="title">
                        GenomeSpy
                    </div>
                    <div class="search">
                        <input
                            type="text"
                            class="search-input"
                            value=${self.genomeSpy
                                ? self.genomeSpy.getViewportDomainString()
                                : ""}
                            @keydown=${onSearchKeyDown}
                            @focus=${onSearchFocused}
                        />
                        ${getSearchHelp()}
                    </div>
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

                self.genomeSpy
                    .search(searchInput.value)
                    .then(() => {
                        searchInput.focus();
                        searchInput.select();
                    })
                    .catch(reason => alert(reason));
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
                self.genomeSpy.search(term);
            });
        }

        this._renderTemplate = () => {
            render(getAppBody(), self.appContainer);
        };

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
                    self.genomeSpy.backtrackSamples();
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

    async launch() {
        const elem = /** @param {string} className */ className =>
            /** @type {HTMLElement} */ (this.appContainer.getElementsByClassName(
                className
            )[0]);

        this.genomeSpy.on("zoom", () => {
            // Could just call _renderTemplate here, but this is very likely more efficient
            /** @type {HTMLInputElement} */ (elem(
                "search-input"
            )).value = this.genomeSpy.getViewportDomainString();
        });

        await this.genomeSpy.launch();

        this._replayProvenanceFromUrl();
        // Update the UI now that GenomeSpy is initialized
        this._renderTemplate();

        this.getSampleHandler()?.provenance.addListener(() => {
            this._renderTemplate();
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
                for (const action of history) {
                    // TODO: Suppress transitions while applying actions
                    this.getSampleHandler().dispatch(action);
                }
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

        /** @type {import("./view/sampleView/sampleView").default} */
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
