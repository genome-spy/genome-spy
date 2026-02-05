import { loader as vegaLoader } from "vega-loader";
import GenomeSpy from "@genome-spy/core/genomeSpy.js";
import "./styles/genome-spy-app.scss";
import favIcon from "@genome-spy/core/img/genomespy-favicon.svg";
import { html, render } from "lit";

import { VISIT_STOP } from "@genome-spy/core/view/view.js";
import SampleView from "./sampleView/sampleView.js";
import IDBBookmarkDatabase from "./bookmark/idbBookmarkDatabase.js";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";

import "./components/toolbar/toolbar.js";
import { debounce } from "@genome-spy/core/utils/debounce.js";
import Provenance from "./state/provenance.js";

import MergeSampleFacets from "./sampleView/mergeFacets.js";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory.js";
import { showMessageDialog } from "./components/generic/messageDialog.js";
import { compressToUrlHash, decompressFromUrlHash } from "./utils/urlHash.js";
import {
    restoreBookmark,
    restoreBookmarkAndShowInfoBox,
} from "./bookmark/bookmark.js";
import { viewSettingsSlice } from "./viewSettingsSlice.js";
import {
    buildViewSettingsPayload,
    getViewVisibilityOverride,
    normalizeViewSettingsPayload,
} from "./viewSettingsUtils.js";
import { validateSelectorConstraints } from "@genome-spy/core/view/viewSelectors.js";
import { subscribeTo, withMicrotask } from "./state/subscribeTo.js";
import SimpleBookmarkDatabase from "./bookmark/simpleBookmarkDatabase.js";
import { isSampleSpec } from "@genome-spy/core/view/viewFactory.js";
import IntentExecutor from "./state/intentExecutor.js";
import { lifecycleSlice } from "./lifecycleSlice.js";
import setupStore from "./state/setupStore.js";
import IntentPipeline from "./state/intentPipeline.js";
import { sampleSlice } from "./sampleView/state/sampleSlice.js";
import { attachIntentStatusUi } from "./state/intentStatusUi.js";

transforms.mergeFacets = MergeSampleFacets;

/**
 * A wrapper for the GenomeSpy core. Provides SampleView, provenance, a toolbar, etc.
 */
export default class App {
    /** @type {(() => void) | undefined} */
    #intentStatusDisposer;
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

        this.#configureContainer(appContainerElement);

        this.#setupBookmarkDatabases();

        render(
            html`<div class="genome-spy-app">
                <genome-spy-toolbar .app=${this}></genome-spy-toolbar>
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
        this.store = setupStore();
        this.intentExecutor = new IntentExecutor(this.store);
        this.provenance = new Provenance(this.store);
        this.intentPipeline = new IntentPipeline({
            store: this.store,
            provenance: this.provenance,
            intentExecutor: this.intentExecutor,
        });
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
        /** @type {Record<string, boolean>} */
        const EMPTY_VISIBILITIES = {};
        const visibilitiesSelector = (
            /** @type {ReturnType<typeof this.store.getState>} */ state
        ) => state.viewSettings?.visibilities ?? EMPTY_VISIBILITIES;

        const originalPredicate = this.genomeSpy.viewVisibilityPredicate;
        this.genomeSpy.viewVisibilityPredicate = (view) => {
            const override = getViewVisibilityOverride(
                visibilitiesSelector(this.store.getState()),
                view
            );
            if (override !== undefined) {
                return override;
            }

            return originalPredicate(view);
        };
    }

    #showSelectorConstraintWarnings() {
        const viewRoot = this.genomeSpy.viewRoot;
        if (!viewRoot) {
            return;
        }

        const issues = validateSelectorConstraints(viewRoot);
        if (!issues.length) {
            return;
        }

        const issueList = issues.map(
            (issue) => html`<li>${issue.message}</li>`
        );

        showMessageDialog(
            html`<p>
                    The visualization loaded, but the view specification has
                    addressing problems. View visibility toggles, bookmarks, and
                    parameter bindings may be disabled or behave incorrectly
                    until these issues are fixed.
                </p>
                <ul>
                    ${issueList}
                </ul>`,
            {
                title: "View specification warnings",
                type: "warning",
            }
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

        // Restore view visibility early so initial data/scale init honors bookmarks.
        // This avoids lazy-init races where in-flight loads miss newly visible branches.
        await this.#restoreViewSettingsFromUrlHash(remoteBookmarkPromise);

        const result = await this.genomeSpy.launch();
        if (!result) {
            return;
        }
        this.#showSelectorConstraintWarnings();

        const sampleView = this.getSampleView();
        if (sampleView) {
            this.intentPipeline.setResolvers({
                getAttributeInfo:
                    sampleView.compositeAttributeInfoSource.getAttributeInfo.bind(
                        sampleView.compositeAttributeInfoSource
                    ),
            });
            const unregisterMetadataHook =
                this.intentPipeline.registerActionHook({
                    predicate: (action) =>
                        action.type === sampleSlice.actions.addMetadata.type ||
                        action.type === sampleSlice.actions.deriveMetadata.type,
                    awaitProcessed: (context) =>
                        sampleView.awaitMetadataReady(context.signal),
                });
            sampleView.registerDisposer(unregisterMetadataHook);
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
                void this.genomeSpy.initializeVisibleViewData();
                this.genomeSpy.viewRoot._invalidateCacheByPrefix(
                    "size",
                    "progeny"
                );

                const context = this.genomeSpy.viewRoot.context;
                context.requestLayoutReflow();
                context.animator.requestRender();
            })
        );
        this.#intentStatusDisposer = attachIntentStatusUi({
            store: this.store,
            intentPipeline: this.intentPipeline,
            provenance: this.provenance,
        });

        try {
            await this.#ensureRemoteBookmarks(remoteBookmarkPromise);
        } catch (e) {
            throw new Error(`Cannot load remote bookmarks: ${e}`);
        }

        try {
            await this._restoreStateFromUrlOrBookmark();
        } catch (e) {
            showMessageDialog(e.toString());
        }

        window.addEventListener(
            "hashchange",
            () =>
                this._restoreStateFromUrl().catch((e) =>
                    showMessageDialog(e.toString())
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

        const title = asArray(this.genomeSpy.spec.description ?? []);

        if (this.isFullPage() && title.length > 0) {
            document.title = "GenomeSpy - " + title;
        }

        this.store.dispatch(lifecycleSlice.actions.setInitialized());
    }

    /**
     * @param {Promise<import("./bookmark/databaseSchema.js").BookmarkEntry[]>} remoteBookmarkPromise
     */
    async #restoreViewSettingsFromUrlHash(remoteBookmarkPromise) {
        const hash = window.location.hash;
        if (!hash) {
            return;
        }
        // Apply viewSettings before the initial dataflow build so views that are
        // visible in a bookmark are initialized eagerly. Otherwise lazy-init
        // can attach new branches while a shared data source is already loading,
        // causing missing data until a manual toggle forces a reload.
        try {
            const entry = await this.#resolveBookmarkFromHash(
                hash,
                remoteBookmarkPromise
            );
            if (entry?.viewSettings) {
                const normalized = normalizeViewSettingsPayload(
                    entry.viewSettings
                );
                this.store.dispatch(
                    viewSettingsSlice.actions.setViewSettings(normalized)
                );
            }
        } catch (e) {
            // Ignore invalid hashes here; _restoreStateFromUrl handles reporting.
        }
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
        const viewRoot = this.genomeSpy.viewRoot;
        if (viewRoot) {
            const viewSettingsPayload = buildViewSettingsPayload(
                viewRoot,
                viewSettings
            );
            if (viewSettingsPayload) {
                hashData.viewSettings = viewSettingsPayload;
            }
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
        if (hash && hash.length > 0) {
            try {
                const resolved =
                    await this.#resolveBookmarkContextFromHash(hash);
                if (!resolved) {
                    return false;
                }
                const { entry, mode, database, afterTourBookmark } = resolved;
                await restoreBookmarkAndShowInfoBox(entry, this, {
                    mode,
                    database,
                    afterTourBookmark,
                });
                return true;
            } catch (e) {
                console.error(e);
                showMessageDialog(
                    html`<p>Cannot restore the state:</p>
                        <p>${e}</p>`
                );
            }
        }
        return false;
    }

    /**
     * Resolve a bookmark entry from the URL hash without applying it.
     *
     * @param {string} hash
     * @param {Promise<import("./bookmark/databaseSchema.js").BookmarkEntry[]>} [remoteBookmarkPromise]
     * @returns {Promise<import("./bookmark/databaseSchema.js").BookmarkEntry | undefined>}
     */
    async #resolveBookmarkFromHash(hash, remoteBookmarkPromise) {
        if (hash.startsWith("#bookmark:")) {
            const remoteConf = this.rootSpec.bookmarks?.remote;
            if (!remoteConf) {
                return;
            }

            const remoteDb =
                this.globalBookmarkDatabase ??
                (remoteBookmarkPromise
                    ? await this.#ensureRemoteBookmarks(remoteBookmarkPromise)
                    : undefined);
            if (!remoteDb) {
                return;
            }

            const bookmarkHashMatch = hash.match(/^#bookmark:(.+)$/)?.[1];
            if (!bookmarkHashMatch) {
                return;
            }

            const name = (await remoteDb.getNames()).find(
                (name) => name.replaceAll(" ", "-") == bookmarkHashMatch
            );
            if (!name) {
                throw new Error(`No such bookmark: ${bookmarkHashMatch}`);
            }

            const bookmark = await remoteDb.get(name);
            if (!bookmark) {
                throw new Error(`No such bookmark: ${name}`);
            }
            return bookmark;
        }

        /** @type {import("./bookmark/databaseSchema.js").BookmarkEntry} */
        return decompressFromUrlHash(hash);
    }

    /**
     * @param {string} hash
     * @returns {Promise<{
     *     entry: import("./bookmark/databaseSchema.js").BookmarkEntry,
     *     mode: "tour" | "shared",
     *     database?: import("./bookmark/bookmarkDatabase.js").default,
     *     afterTourBookmark?: string,
     * } | undefined>}
     */
    async #resolveBookmarkContextFromHash(hash) {
        const entry = await this.#resolveBookmarkFromHash(hash);
        if (!entry) {
            return;
        }

        if (hash.startsWith("#bookmark:")) {
            const remoteConf = this.rootSpec.bookmarks?.remote;
            return {
                entry,
                mode: "tour",
                database: this.globalBookmarkDatabase,
                afterTourBookmark: remoteConf?.afterTourBookmark,
            };
        }

        return {
            entry,
            mode: "shared",
            database: this.localBookmarkDatabase,
        };
    }

    /**
     * @param {Promise<import("./bookmark/databaseSchema.js").BookmarkEntry[]>} remoteBookmarkPromise
     * @returns {Promise<import("./bookmark/bookmarkDatabase.js").default | undefined>}
     */
    async #ensureRemoteBookmarks(remoteBookmarkPromise) {
        const remoteBookmarks = await remoteBookmarkPromise;
        if (!remoteBookmarks.length) {
            return;
        }
        if (!this.globalBookmarkDatabase) {
            this.globalBookmarkDatabase = new SimpleBookmarkDatabase(
                remoteBookmarks
            );
        }
        return this.globalBookmarkDatabase;
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
