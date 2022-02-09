import { loader as vegaLoader } from "vega-loader";
import GenomeSpy from "@genome-spy/core/genomeSpy";
import "./styles/genome-spy-app.scss";
import favIcon from "@genome-spy/core/img/genomespy-favicon.svg";
import { html, render } from "lit";

import { VISIT_STOP } from "@genome-spy/core/view/view";
import SampleView, { isSampleSpec } from "./sampleView/sampleView";
import IDBBookmarkDatabase from "./bookmark/idbBookmarkDatabase";
import { asArray } from "@genome-spy/core/utils/arrayUtils";

import "./components/toolbar";
import { createRef, ref } from "lit/directives/ref.js";
import { debounce } from "@genome-spy/core/utils/debounce";
import Provenance from "./state/provenance";

import MergeSampleFacets from "./sampleView/mergeFacets";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory";
import { messageBox } from "./utils/ui/modal";
import { compressToUrlHash, decompressFromUrlHash } from "./utils/urlHash";
import {
    restoreBookmark,
    restoreBookmarkAndShowInfoBox,
} from "./bookmark/bookmark";
import StoreHelper from "./state/storeHelper";
import { watch } from "./state/watch";
import { viewSettingsSlice } from "./viewSettingsSlice";
import SimpleBookmarkDatabase from "./bookmark/simpleBookmarkDatabase";

transforms.mergeFacets = MergeSampleFacets;

/**
 * A wrapper for the GenomeSpy core. Provides SampleView, provenance, a toolbar, etc.
 */
export default class App {
    /**
     *
     * @param {HTMLElement} appContainerElement
     * @param {import("./spec/appSpec").AppRootSpec} config
     * @param {import("@genome-spy/core/embedApi").EmbedOptions} options
     */
    constructor(appContainerElement, config, options = {}) {
        // eslint-disable-next-line consistent-this
        const self = this;

        this.config = config;

        /** @type {StoreHelper<import("./state").State>} */
        this.storeHelper = new StoreHelper();
        this.storeHelper.addReducer("viewSettings", viewSettingsSlice.reducer);

        /** @type {Provenance<import("./sampleView/sampleState").SampleHierarchy>} */
        this.provenance = new Provenance(this.storeHelper);

        /** @type {(() => void)[]} */
        this._initializationListeners = [];

        this.toolbarRef = createRef();

        this.appContainer = appContainerElement;
        this._configureContainer();

        // TODO: A registry for different types of bookmark sources

        /**
         * Local bookmarks in the IndexedDB
         * @type {import("./bookmark/bookmarkDatabase").default}
         */
        this.localBookmarkDatabase =
            typeof config.specId == "string"
                ? new IDBBookmarkDatabase(config.specId)
                : undefined;

        /**
         * Remote bookmarks loaded from a URL
         * @type {import("./bookmark/bookmarkDatabase").default}
         */
        this.globalBookmarkDatabase = undefined;

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
                    /** @type {import("./appTypes").DependencyQueryEvent} */ event
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

        this.genomeSpy = new GenomeSpy(
            elem("genome-spy-container"),
            this.config,
            options
        );

        this.genomeSpy.viewFactory.addViewType(
            isSampleSpec,
            (spec, context, parent, defaultName) =>
                new SampleView(
                    spec,
                    context,
                    parent,
                    defaultName,
                    this.provenance
                )
        );

        const originalPredicate = this.genomeSpy.viewVisibilityPredicate;
        this.genomeSpy.viewVisibilityPredicate = (view) =>
            this.storeHelper.state.viewSettings?.visibilities[view.name] ??
            originalPredicate(view);
    }

    /**
     * @param {() => void} listener
     */
    addInitializationListener(listener) {
        if (this._initializationListeners) {
            this._initializationListeners.push(listener);
        } else {
            listener();
        }
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
        /**
         * Initiate async fetching of the remote bookmark entries.
         * @type {Promise<import("./bookmark/databaseSchema").BookmarkEntry[]>}
         */
        const remoteBookmarkPromise = this.config.bookmarks?.remote
            ? vegaLoader({ baseURL: this.config.baseUrl })
                  .load(this.config.bookmarks.remote.url)
                  .then((/** @type {string} */ str) =>
                      Promise.resolve(JSON.parse(str))
                  )
            : Promise.resolve([]);

        const result = await this.genomeSpy.launch();
        if (!result) {
            return;
        }

        this.storeHelper.subscribe(
            watch(
                (/** @type {import("./state").State} */ state) =>
                    state.viewSettings?.visibilities,
                (_viewVisibilities, _oldViewVisibilities) => {
                    // TODO: Optimize: only invalidate the affected views
                    this.genomeSpy.viewRoot._invalidateCacheByPrefix(
                        "size",
                        "progeny"
                    );

                    // Terrible hack because summaryViews is not visitable
                    // TODO: Refactor to fix the above
                    this.getSampleView()?.summaryViews?._invalidateCacheByPrefix(
                        "size",
                        "self"
                    );

                    const context = this.genomeSpy.viewRoot.context;
                    context.requestLayoutReflow();
                    context.animator.requestRender();
                },
                this.storeHelper.store.getState()
            )
        );

        try {
            const remoteBookmarks = await remoteBookmarkPromise;
            if (remoteBookmarks.length) {
                this.globalBookmarkDatabase = new SimpleBookmarkDatabase(
                    remoteBookmarks
                );
            }
        } catch (e) {
            throw new Error(`Cannot load remote bookmarks: ${e}`);
        }

        await this._restoreStateFromUrlOrBookmark();

        this.storeHelper.subscribe(() => {
            this._updateStateToUrl();
        });

        window.addEventListener(
            "hashchange",
            () => this._restoreStateFromUrl(),
            false
        );

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

        const toolbar = /** @type {import("./components/toolbar").default} */ (
            this.toolbarRef.value
        );
        // Just trigger re-render. Need a way to broadcast this to all components.
        toolbar.appInitialized = true;

        const title = asArray(this.genomeSpy.spec.description ?? []);

        if (this.isFullPage() && title.length > 0) {
            document.title = "GenomeSpy - " + title;
        }

        for (const listener of this._initializationListeners) {
            listener();
        }
        this._initializationListeners = undefined;
    }

    /**
     * Restore state from url. If not restored, load a bookmark if requested in config.
     */
    async _restoreStateFromUrlOrBookmark() {
        const restored = this._restoreStateFromUrl();
        const remoteConf = this.config.bookmarks?.remote;
        const remoteDb = this.globalBookmarkDatabase;

        if (!restored && remoteConf && remoteDb) {
            const name =
                remoteConf.initialBookmark ??
                (remoteConf.tour && (await remoteDb.getNames())[0]);

            if (name) {
                const bookmark = await remoteDb.get(name);
                if (!bookmark) {
                    throw new Error(`No such bookmark: ${name}`);
                }
                if (remoteConf.tour) {
                    await restoreBookmarkAndShowInfoBox(bookmark, this, {
                        mode: "tour",
                        database: remoteDb,
                    });
                } else {
                    // Just load the state. Don't show the message box.
                    await restoreBookmark(bookmark, this);
                }
            }
        }
    }

    /**
     * Update provenance to url
     */
    _updateStateToUrl() {
        /** @type {import("./appTypes").UrlHash} */
        const hashData = {
            actions: [],
            scaleDomains: {},
        };

        const history = this.provenance.getBookmarkableActionHistory();
        if (history?.length) {
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

        const viewSettings = this.storeHelper.state.viewSettings;
        if (Object.keys(viewSettings.visibilities).length) {
            hashData.viewSettings = viewSettings;
        }

        const hash =
            hashData.actions.length ||
            Object.keys(hashData.scaleDomains).length ||
            hashData.viewSettings
                ? compressToUrlHash(hashData)
                : "";

        window.history.replaceState(
            undefined,
            document.title,
            window.location.pathname + window.location.search + hash
        );
    }

    /**
     * @returns {boolean} `true` if restored successfully
     */
    _restoreStateFromUrl() {
        const hash = window.location.hash;
        if (hash && hash.length > 0) {
            try {
                /** @type {import("./appTypes").UrlHash} */
                const entry = decompressFromUrlHash(hash);
                restoreBookmarkAndShowInfoBox(entry, this, { mode: "shared" });
                return true;
            } catch (e) {
                console.error(e);
                messageBox(
                    html`<p>Cannot restore the state:</p>
                        <p>${e}</p>`
                );
            }
        }
        return false;
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
    const headTitle = document.querySelector("head");
    const setFavicon = document.createElement("link");
    setFavicon.setAttribute("rel", "shortcut icon");
    setFavicon.setAttribute("href", favImg);
    headTitle.appendChild(setFavicon);
}
