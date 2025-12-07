import { loader as vegaLoader } from "vega-loader";
import GenomeSpy from "@genome-spy/core/genomeSpy.js";
import "./styles/genome-spy-app.scss";
import favIcon from "@genome-spy/core/img/genomespy-favicon.svg";
import { html, render } from "lit";

import { VISIT_STOP } from "@genome-spy/core/view/view.js";
import SampleView from "./sampleView/sampleView.js";
import IDBBookmarkDatabase from "./bookmark/idbBookmarkDatabase.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";

import "./components/toolbar.js";
import { createRef, ref } from "lit/directives/ref.js";
import { debounce } from "@genome-spy/core/utils/debounce.js";
import Provenance from "./state/provenance.js";

import MergeSampleFacets from "./sampleView/mergeFacets.js";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory.js";
import { messageBox } from "./utils/ui/modal.js";
import { compressToUrlHash, decompressFromUrlHash } from "./utils/urlHash.js";
import {
    restoreBookmark,
    restoreBookmarkAndShowInfoBox,
} from "./bookmark/bookmark.js";
import { subscribeTo, withMicrotask } from "./state/subscribeTo.js";
import { viewSettingsSlice } from "./viewSettingsSlice.js";
import SimpleBookmarkDatabase from "./bookmark/simpleBookmarkDatabase.js";
import { isSampleSpec } from "@genome-spy/core/view/viewFactory.js";
import {
    combineReducers,
    configureStore,
    createSelector,
} from "@reduxjs/toolkit";
import { createProvenanceReducer } from "./state/provenanceReducerBuilder.js";
import { sampleSlice } from "./sampleView/sampleSlice.js";
import IntentExecutor from "./state/intentExecutor.js";

transforms.mergeFacets = MergeSampleFacets;

/**
 * A wrapper for the GenomeSpy core. Provides SampleView, provenance, a toolbar, etc.
 */
export default class App {
    /**
     * @param {HTMLElement} appContainerElement
     * @param {import("./spec/appSpec.js").AppRootSpec} rootSpec
     * @param {import("@genome-spy/core/types/embedApi.js").EmbedOptions & Partial<{showInspectorButton: boolean}>} options
     */
    constructor(appContainerElement, rootSpec, options = {}) {
        // eslint-disable-next-line consistent-this
        const self = this;

        this.rootSpec = rootSpec;

        this.options = {
            showInspectorButton: true,
            ...options,
            // App has a specialized handler for input bindings
            inputBindingContainer: /** @type {"none"} */ ("none"),
        };

        this.#setupStoreAndProvenance();

        // TODO: Replace with redux state
        /** @type {(() => void)[]} */
        this._initializationListeners = [];

        // TODO: Replace with redux state
        this.toolbarRef = createRef();

        this.#configureContainer(appContainerElement);

        this.#setupBookmarkDatabases();

        render(
            html`<div class="genome-spy-app">
                <genome-spy-toolbar
                    ${ref(self.toolbarRef)}
                    .app=${self}
                ></genome-spy-toolbar>
                <div class="genome-spy-container"></div>
            </div>`,
            this.appContainer
        );

        // Dependency injection
        // TODO: Replace this with something standard-based when such a thing becomes available
        this.appContainer
            .querySelector(".genome-spy-app")
            .addEventListener(
                "query-dependency",
                (
                    /** @type {import("./appTypes.js").DependencyQueryEvent} */ event
                ) => {
                    if (event.detail.name == "app") {
                        event.detail.setter(self);
                        event.stopPropagation();
                    }
                }
            );

        this.genomeSpy = new GenomeSpy(
            /** @type {HTMLElement} */ (
                this.appContainer.getElementsByClassName(
                    "genome-spy-container"
                )[0]
            ),
            this.rootSpec,
            this.options
        );

        this.genomeSpy.viewFactory.addViewType(
            isSampleSpec,
            (
                /** @type {import("@genome-spy/core/spec/sampleView.js").SampleSpec} */ spec,
                context,
                layoutParent,
                dataParent,
                defaultName
            ) =>
                new SampleView(
                    spec,
                    context,
                    layoutParent,
                    dataParent,
                    defaultName,
                    this.provenance,
                    this.intentExecutor
                )
        );

        this.#setupViewVisibilityHandling();
    }

    #setupStoreAndProvenance() {
        const provenanceReducer = createProvenanceReducer(
            { [sampleSlice.name]: sampleSlice.reducer },
            { ignoreInitialState: true }
        );

        this.store = configureStore({
            reducer: combineReducers({
                viewSettings: viewSettingsSlice.reducer,
                provenance: provenanceReducer,
            }),
        });

        this.intentExecutor = new IntentExecutor(this.store);
        this.provenance = new Provenance(this.store, this.intentExecutor);
    }

    #setupBookmarkDatabases() {
        // TODO: A registry for different types of bookmark sources

        /**
         * Local bookmarks in the IndexedDB
         * @type {import("./bookmark/bookmarkDatabase.js").default}
         */
        this.localBookmarkDatabase =
            typeof this.rootSpec.specId == "string"
                ? new IDBBookmarkDatabase(this.rootSpec.specId)
                : undefined;

        /**
         * Remote bookmarks loaded from a URL
         * @type {import("./bookmark/bookmarkDatabase.js").default}
         */
        this.globalBookmarkDatabase = undefined;
    }

    /**
     * @param {HTMLElement} appContainerElement
     */
    #configureContainer(appContainerElement) {
        this.appContainer = appContainerElement;
        if (this.isFullPage()) {
            this.appContainer.style.margin = "0";
            this.appContainer.style.padding = "0";
            this.appContainer.style.overflow = "hidden";

            setFavicon(favIcon);
        } else {
            this.appContainer.style.position = "relative";
        }
    }

    #setupViewVisibilityHandling() {
        const visibilitiesSelector = createSelector(
            (/** @type {ReturnType<typeof this.store.getState>} */ state) =>
                state.viewSettings?.visibilities,
            (visibilities) => visibilities ?? {}
        );

        const originalPredicate = this.genomeSpy.viewVisibilityPredicate;
        this.genomeSpy.viewVisibilityPredicate = (view) =>
            visibilitiesSelector(this.store.getState())[view.name] ??
            originalPredicate(view);
    }

    /**
     * TODO: Replace this with a redux state
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
         * @type {Promise<import("./bookmark/databaseSchema.js").BookmarkEntry[]>}
         */
        const remoteBookmarkPromise = this.rootSpec.bookmarks?.remote
            ? vegaLoader({ baseURL: this.rootSpec.baseUrl })
                  .load(this.rootSpec.bookmarks.remote.url)
                  .then((/** @type {string} */ str) =>
                      Promise.resolve(JSON.parse(str))
                  )
            : Promise.resolve([]);

        const result = await this.genomeSpy.launch();
        if (!result) {
            return;
        }

        // Make it focusable so that keyboard shortcuts can be caught
        this.appContainer
            .querySelector("canvas")
            .setAttribute("tabindex", "-1");

        subscribeTo(
            this.store,
            (state) => state.viewSettings?.visibilities,
            withMicrotask(() => {
                // TODO: Optimize: only invalidate the affected views
                this.genomeSpy.viewRoot._invalidateCacheByPrefix(
                    "size",
                    "progeny"
                );

                const context = this.genomeSpy.viewRoot.context;
                context.requestLayoutReflow();
                context.animator.requestRender();
            })
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

        try {
            await this._restoreStateFromUrlOrBookmark();
        } catch (e) {
            messageBox(e.toString());
        }

        window.addEventListener(
            "hashchange",
            () =>
                this._restoreStateFromUrl().catch((e) =>
                    messageBox(e.toString())
                ),
            false
        );

        const debouncedUpdateUrl = debounce(
            () => this._updateStateToUrl(),
            500,
            false
        );

        this.store.subscribe(debouncedUpdateUrl);

        for (const [, res] of this.genomeSpy.getNamedScaleResolutions()) {
            if (res.isZoomable()) {
                res.addEventListener("domain", debouncedUpdateUrl);
            }
        }

        const toolbar =
            /** @type {import("./components/toolbar.js").default} */ (
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
        const remoteConf = this.rootSpec.bookmarks?.remote;
        const remoteDb = this.globalBookmarkDatabase;

        const restored = await this._restoreStateFromUrl();
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
                        afterTourBookmark: remoteConf.afterTourBookmark,
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
        /** @type {import("./appTypes.js").UrlHash} */
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

        const viewSettings = this.store.getState().viewSettings;
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
     * @returns {Promise<boolean>} `true` if restored successfully
     */
    async _restoreStateFromUrl() {
        const hash = window.location.hash;
        const bookmarkHashMatch = hash.match(/^#bookmark:(.+)$/)?.[1];
        if (bookmarkHashMatch) {
            const remoteConf = this.rootSpec.bookmarks?.remote;
            const remoteDb = this.globalBookmarkDatabase;
            if (remoteConf && remoteDb) {
                const name = (await remoteDb.getNames()).find(
                    (name) => name.replaceAll(" ", "-") == bookmarkHashMatch
                );
                if (!name) {
                    throw new Error(`No such bookmark: ${bookmarkHashMatch}`);
                } else {
                    const bookmark = await remoteDb.get(name);
                    if (!bookmark) {
                        throw new Error(`No such bookmark: ${name}`);
                    }
                    await restoreBookmarkAndShowInfoBox(bookmark, this, {
                        mode: "tour",
                        database: remoteDb,
                    });
                    return true;
                }
            }
        }

        if (hash && hash.length > 0) {
            try {
                /** @type {import("./bookmark/databaseSchema.js").BookmarkEntry} */
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

    getSampleView() {
        if (!this.genomeSpy?.viewRoot) {
            return;
        }

        /** @type {import("./sampleView/sampleView.js").default} */
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
