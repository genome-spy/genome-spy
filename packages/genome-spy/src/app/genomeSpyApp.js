import {
    compressToEncodedURIComponent,
    decompressFromEncodedURIComponent,
} from "lz-string";

import GenomeSpy from "../genomeSpy";
import "../styles/genome-spy-app.scss";
import favIcon from "../img/genomespy-favicon.svg";
import { html, render } from "lit";

import { VISIT_STOP } from "../view/view";
import SampleView from "./sampleView/sampleView";
import BookmarkDatabase from "./bookmarkDatabase";
import { asArray } from "../utils/arrayUtils";

import "./components/provenanceToolbar-wc";
import "./components/bookmarkButton-wc";
import "./components/toolbar-wc";
import { createRef, ref } from "lit/directives/ref.js";
import { debounce } from "../utils/debounce";
import Provenance from "./provenance";

/**
 * A simple wrapper for the GenomeSpy core.
 */
export default class GenomeSpyApp {
    /**
     *
     * @param {HTMLElement} appContainerElement
     * @param {import("../spec/root").RootSpec} config
     * @param {import("../options").EmbedOptions} options
     */
    constructor(appContainerElement, config, options = {}) {
        // eslint-disable-next-line consistent-this
        const self = this;

        this.config = config;

        this.provenance = new Provenance();

        // Fugly temp hack
        window.provenance = this.provenance;

        this.toolbarRef = createRef();

        this.appContainer = appContainerElement;
        this._configureContainer();

        this.bookmarkDatabase =
            typeof config.specId == "string"
                ? new BookmarkDatabase(config.specId)
                : undefined;

        render(
            html`<div class="genome-spy-app">
                <genome-spy-toolbar
                    ${ref(self.toolbarRef)}
                    .app=${self}
                ></genome-spy-toolbar>
                <div class="genome-spy-container"></div>
            </div>`,
            self.appContainer
        );

        // Dependency injection
        // TODO: Replace this with something standard-based when such a thing becomes available
        self.appContainer
            .querySelector(".genome-spy-app")
            .addEventListener(
                "query-dependency",
                (
                    /** @type {import("./genomeSpyAppTypes").DependencyQueryEvent} */ event
                ) => {
                    if (event.detail.name == "app") {
                        event.detail.setter(self);
                        event.stopPropagation();
                    }
                }
            );

        /** @param {string} className */
        const elem = (className) =>
            /** @type {HTMLElement} */ (
                this.appContainer.getElementsByClassName(className)[0]
            );

        elem("genome-spy-container").addEventListener("click", (event) => {
            elem("search-input").blur();
        });

        this.genomeSpy = new GenomeSpy(
            elem("genome-spy-container"),
            this.config,
            options
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

        await this._restoreStateFromUrl();
        this.provenance.subscribe(() => {
            this._updateStateToUrl();
        });

        const debouncedUpdateUrl = debounce(
            () => this._updateStateToUrl(),
            500,
            false
        );
        for (const [, res] of this.genomeSpy.getNamedScaleResolutions()) {
            if (res.isZoomable()) {
                res.addEventListener("domain", debouncedUpdateUrl);
            }
        }

        const toolbar =
            /** @type {import("./components/toolbar-wc").default} */ (
                this.toolbarRef.value
            );
        // Just trigger re-render. Need a way to broadcast this to all components.
        toolbar.appInitialized = true;

        const title = asArray(this.genomeSpy.spec.description ?? []);

        if (this.isFullPage() && title.length > 0) {
            document.title = "GenomeSpy - " + title;
        }
    }

    /**
     * Update provenance to url
     */
    _updateStateToUrl() {
        /** @type {import("./genomeSpyAppTypes").UrlHash} */
        const hashData = {
            actions: [],
            scaleDomains: {},
        };

        const history = this.provenance.getBookmarkableActionHistory();
        if (history.length) {
            hashData.actions = history;
        }

        // This is copypaste from bookmarks. TODO: consolidate
        for (const [name, scaleResolution] of this.genomeSpy
            .getNamedScaleResolutions()
            .entries()) {
            if (!scaleResolution.isZoomed()) {
                hashData.scaleDomains[name] =
                    scaleResolution.getComplexDomain();
            }
        }

        // TODO: Test https://github.com/101arrowz/fflate as a replacement for lzString

        let hash =
            hashData.actions.length || Object.keys(hashData.scaleDomains).length
                ? "#" + compressToEncodedURIComponent(JSON.stringify(hashData))
                : "";

        window.history.replaceState(
            undefined,
            document.title,
            window.location.pathname + window.location.search + hash
        );
    }

    async _restoreStateFromUrl() {
        const hash = window.location.hash;
        if (hash && hash.length > 0) {
            try {
                /** @type {import("./genomeSpyAppTypes").UrlHash} */
                const hashData = JSON.parse(
                    decompressFromEncodedURIComponent(hash.substr(1))
                );

                if (hashData.actions) {
                    // This is copypaste from bookmarks. TODO: consolidate
                    this.provenance.activateState(0);
                    this.provenance.dispatch(hashData.actions);
                }

                /** @type {Promise<void>[]} */
                const promises = [];
                for (const [name, scaleDomain] of Object.entries(
                    hashData.scaleDomains ?? {}
                )) {
                    const scaleResolution = this.genomeSpy
                        .getNamedScaleResolutions()
                        .get(name);
                    if (scaleResolution) {
                        // @ts-ignore
                        promises.push(scaleResolution.zoomTo(scaleDomain));
                    } else {
                        console.warn(
                            `Cannot restore scale domain. Unknown name: ${name}`
                        );
                    }
                }
                await Promise.all(promises);
            } catch (e) {
                console.error(e);
                alert(`Cannot restore state from URL:\n${e}`);
                this.provenance.activateState(0);
            }
        }
    }

    _configureContainer() {
        if (this.isFullPage()) {
            this.appContainer.style.margin = "0";
            this.appContainer.style.padding = "0";
            this.appContainer.style.overflow = "hidden";

            setFavicon(favIcon);
        } else {
            this.appContainer.style.position = "relative";
        }
    }

    /**
     *
     * @param {import("../spec/root").RootSpec} config
     */
    async updateConfig(config) {
        // TODO: provenance etc must be re-registered etc
        throw new Error("Broken");

        /*
        this.config = config;
        // TODO: Preserve viewport
        this.genomeSpy.destroy();
        await this.launch();
		*/
    }

    getSampleView() {
        if (!this.genomeSpy?.viewRoot) {
            return;
        }

        /** @type {import("./sampleView/sampleView").default} */
        let sampleView;

        this.genomeSpy.viewRoot.visit((view) => {
            if (view instanceof SampleView) {
                sampleView = view;
                return VISIT_STOP;
            }
        });

        return sampleView;
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
