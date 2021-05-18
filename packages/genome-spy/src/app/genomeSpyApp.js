import lzString from "lz-string";

import GenomeSpy from "../genomeSpy";
import "../styles/genome-spy-app.scss";
import favIcon from "../img/genomespy-favicon.svg";
import { html, render, nothing } from "lit";

import { VISIT_STOP } from "../view/view";
import SampleView from "../view/sampleView/sampleView";
import BookmarkDatabase from "../sampleHandler/bookmarkDatabase";
import { asArray } from "../utils/arrayUtils";

import "../sampleHandler/provenanceToolbar-wc";
import "../sampleHandler/bookmarkButton-wc";
import "./toolbar-wc";
import { createRef, ref } from "lit/directives/ref";

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

        this.toolbarRef = createRef();

        //this.launched = false;

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

        this.bookmarkDatabase =
            typeof config.specId == "string"
                ? new BookmarkDatabase(config.specId)
                : undefined;

        this._renderTemplate = () => {
            render(getAppBody(), self.appContainer);
        };

        function getAppBody() {
            return html`
                <div class="genome-spy-app">
                    <genome-spy-toolbar
                        ${ref(self.toolbarRef)}
                        .app=${self}
                    ></genome-spy-toolbar>
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

        this._replayProvenanceFromUrl();
        this.getSampleHandler()?.provenance.addListener(() => {
            this._updateUrl();
        });

        const toolbar = /** @type {import("./toolbar-wc").default} */ (this
            .toolbarRef.value);
        // Just trigger re-render. Need a way to broadcast this to all components.
        toolbar.appInitialized = true;

        const title = asArray(this.genomeSpy.config.description ?? []);

        if (this.isFullPage() && title.length > 0) {
            document.title = "GenomeSpy - " + title;
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
