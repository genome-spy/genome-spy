import { createViewMutationApi } from "@genome-spy/core/view/viewMutationApi.js";
import { createDatumSearch } from "@genome-spy/core/search";
import { loader as vegaLoader } from "vega-loader";
import GenomeSpy from "@genome-spy/core/genomeSpy.js";
import "./styles/genome-spy-app.scss";
import favIcon from "@genome-spy/core/img/genomespy-favicon.svg";
import { html, nothing, render } from "lit";

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
import { createPlotBookmarkContext } from "./bookmark/bookmarkState.js";
import { collectScaleDomains } from "./bookmark/scaleDomainUtils.js";
import { viewSettingsSlice } from "./viewSettingsSlice.js";
import {
    buildViewSettingsPayload,
    getViewVisibilityOverride,
    normalizeViewSettingsPayload,
    resolveRadioVisibilityConflicts,
} from "./viewSettingsUtils.js";
import { subscribeTo, withMicrotask } from "./state/subscribeTo.js";
import SimpleBookmarkDatabase from "./bookmark/simpleBookmarkDatabase.js";
import { isSampleSpec } from "./sampleView/specGuards.js";
import IntentExecutor from "./state/intentExecutor.js";
import { lifecycleSlice } from "./lifecycleSlice.js";
import setupStore, { resetCohort } from "./state/setupStore.js";
import { sampleSlice } from "./sampleView/state/sampleSlice.js";
import {
    resolveParamSelector,
    resolveViewSelector,
} from "@genome-spy/core/view/viewSelectors.js";
import { getViewVisibilityKey } from "./viewSettingsUtils.js";
import ConcatView from "@genome-spy/core/view/concatView.js";
import { getDefaultParamValue } from "@genome-spy/core/paramRuntime/paramUtils.js";
import IntentPipeline from "./state/intentPipeline.js";
import { setupMetadataSourceRuntime } from "./sampleView/metadata/metadataSourceRuntime.js";
import { attachIntentStatusUi } from "./state/intentStatusUi.js";
import ParamProvenanceBridge from "./state/paramProvenanceBridge.js";
import { getParamActionInfo } from "./state/paramActionInfo.js";
import { validateSelectorConstraints } from "./viewSelectorConstraints.js";
import { resetProvenanceHistory } from "./state/provenanceBaseline.js";
import { concatUrl, getDirectory } from "@genome-spy/core/utils/url.js";
import { paramProvenanceSlice } from "./state/paramProvenanceSlice.js";
import { setupSelectionExpansionContextMenu } from "./state/selectionExpansionContextMenu.js";
import {
    createDefaultAppKeyboardShortcuts,
    setupAppKeyboardShortcuts,
} from "./appKeyboardShortcuts.js";
import AppUiRegistry from "./appUiRegistry.js";

transforms.mergeFacets = MergeSampleFacets;

/**
 * A wrapper for the GenomeSpy core. Provides SampleView, provenance, a toolbar, etc.
 */
export default class App {
    /**
     * Lazily created agent boundary.
     * @type {Promise<import("./agentApi/index.js").AgentApi> | undefined}
     */
    #agentApiPromise;

    /** @type {Set<() => void>} */
    #disposers = new Set();

    #finalized = false;

    /** @type {SampleView | undefined} */
    #activeSampleView;

    /** @type {SampleView | undefined} */
    #sampleViewCandidate;

    /** @type {Set<Promise<unknown>>} */
    #pendingCohortOperations = new Set();

    /** @type {Pick<import("./spec/appSpec.js").AppRootSpec, "specId" | "baseUrl" | "bookmarks">} */
    #persistenceConfig;

    #updateUrl = debounce(
        () => {
            if (
                !this.#finalized &&
                !this.store.getState().lifecycle.cohortTransitioning
            )
                this._updateStateToUrl();
        },
        500,
        false
    );

    /** @type {(() => void)[]} */
    #scaleSubscriptions = [];

    /** @type {import("./embedTypes.js").AppViewApi} */
    views;

    /** @type {import("@genome-spy/core/types/search.js").DatumSearch} */
    datumSearch;

    /**
     * @param {HTMLElement} appContainerElement
     * @param {import("./spec/appSpec.js").AppRootSpec} rootSpec
     * @param {import("./appTypes.js").AppEmbedOptions} options
     */
    constructor(appContainerElement, rootSpec, options = {}) {
        this.rootSpec = rootSpec;
        this.#persistenceConfig = rootSpec;

        this.options = {
            embedMode: /** @type {const} */ ("standalone"),
            ...options,
            // App has a specialized handler for input bindings
            inputBindingContainer: /** @type {"none"} */ ("none"),
        };

        /** @type {import("./appTypes.js").AppUiRegistry} */
        this.ui = new AppUiRegistry();

        this.#setupStoreAndProvenance();

        this.#configureContainer(appContainerElement);

        this.#setupBookmarkDatabases();

        // Give each App its own Lit root so a failed embed can reuse the container.
        const renderBefore = document.createComment("GenomeSpy App");
        this.appContainer.appendChild(renderBefore);
        const rootPart = render(
            html`<div class="genome-spy-app">
                <genome-spy-toolbar .app=${this}></genome-spy-toolbar>
                <div class="genome-spy-workspace">
                    <div class="genome-spy-container"></div>
                    ${
                        this.isEmbedded()
                            ? nothing
                            : html`<div
                                  class="genome-spy-side-panel-host"
                              ></div>`
                    }
                </div>
            </div>`,
            this.appContainer,
            { renderBefore }
        );
        this.#registerDisposer(() => rootPart.setConnected(false));

        if (!this.isEmbedded()) {
            this.ui.attachAppShell(
                /** @type {HTMLElement} */ (
                    this.appContainer.querySelector(".genome-spy-app")
                )
            );
        }

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
                        event.detail.setter(this);
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
            /** @type {any} */ (this.rootSpec),
            this.options
        );

        /** @type {import("@genome-spy/core/types/embedApi.js").EmbedDebugApi} */
        this.debug = {
            getViewRoot: () => this.genomeSpy?.viewRoot,
            getModules: () => this.getDebugModules(),
        };

        this.genomeSpy.viewFactory.addViewType(
            isSampleSpec,
            /** @type {any} */ (
                (
                    /** @type {import("@genome-spy/app/spec/sampleView.js").SampleSpec} */ spec,
                    /** @type {any} */ context,
                    /** @type {any} */ layoutParent,
                    /** @type {any} */ dataParent,
                    /** @type {any} */ defaultName
                ) =>
                    /** @type {any} */ (
                        this.#createSampleView(
                            spec,
                            context,
                            layoutParent,
                            dataParent,
                            defaultName
                        )
                    )
            )
        );
        this.#setupViewVisibilityHandling();
    }

    /**
     * Track complete external operations; their internal pipeline continuations
     * remain free to finish while a mutation waits for them.
     * @template T
     * @param {() => T} operation
     * @returns {T}
     */
    runCohortOperation(operation) {
        if (this.#finalized) throw new Error("App has been finalized.");
        if (this.store.getState().lifecycle.cohortTransitioning)
            throw new Error(
                "The cohort is changing. Wait for the view mutation to finish."
            );
        const result = operation();
        const completion = Promise.resolve(result);
        this.#pendingCohortOperations.add(completion);
        void completion.then(
            () => this.#pendingCohortOperations.delete(completion),
            () => this.#pendingCohortOperations.delete(completion)
        );
        return result;
    }

    /**
     * @param {import("./spec/sampleView.js").SampleSpec} spec
     * @param {import("@genome-spy/core/types/viewContext.js").default} context
     * @param {import("@genome-spy/core/view/containerView.js").default} layoutParent
     * @param {import("@genome-spy/core/view/view.js").default} dataParent
     * @param {string} name
     */
    #createSampleView(spec, context, layoutParent, dataParent, name) {
        if (this.#finalized) throw new Error("App has been finalized.");
        if (this.#activeSampleView || this.#sampleViewCandidate) {
            throw new Error(
                "GenomeSpy App supports only one SampleView. Remove the current cohort first."
            );
        }
        const view = new SampleView(
            spec,
            context,
            layoutParent,
            dataParent,
            name,
            this.provenance,
            this.intentExecutor,
            createPlotBookmarkContext(this)
        );
        this.#sampleViewCandidate = view;
        view.runCohortOperation = (operation) => {
            if (view.disposed) throw new Error("SampleView has been disposed.");
            return this.runCohortOperation(operation);
        };
        view.registerDisposer(() => {
            if (this.#sampleViewCandidate === view)
                this.#sampleViewCandidate = undefined;
            if (this.#activeSampleView === view)
                this.#activeSampleView = undefined;
        });
        return view;
    }

    /**
     * @template T
     * @param {() => Promise<T>} operation
     * @param {import("@genome-spy/core/view/view.js").default} [removalRoot]
     */
    async #runViewMutation(operation, removalRoot) {
        if (this.store.getState().lifecycle.cohortTransitioning)
            return this.#mutateCohort(operation, removalRoot);
        if (this.#finalized) throw new Error("App has been finalized.");

        this.store.dispatch(
            lifecycleSlice.actions.setCohortTransitioning(true)
        );
        try {
            await Promise.allSettled(this.#pendingCohortOperations);
            await this.getSampleView()?.metadataView?.whenMetadataSettled();
            if (this.#finalized) throw new Error("App has been finalized.");
            this.paramProvenanceBridge?.flushPendingChanges();
            this.paramProvenanceBridge?.dispose();
            return await this.#mutateCohort(operation, removalRoot);
        } finally {
            try {
                if (!this.#finalized) {
                    try {
                        await this.#attachSampleView();
                    } finally {
                        this.#bindParamProvenance();
                        this.#observeScaleDomains();
                        this.store.dispatch(
                            lifecycleSlice.actions.hierarchyChanged()
                        );
                    }
                }
            } finally {
                if (!this.#finalized)
                    this.store.dispatch(
                        lifecycleSlice.actions.setCohortTransitioning(false)
                    );
                if (!this.#finalized && !this.isEmbedded())
                    this._updateStateToUrl();
            }
        }
    }

    /**
     * @template T
     * @param {() => Promise<T>} operation
     * @param {import("@genome-spy/core/view/view.js").default} [removalRoot]
     */
    async #mutateCohort(operation, removalRoot) {
        const sampleView = this.#activeSampleView ?? this.#sampleViewCandidate;
        const descendants = removalRoot?.getDescendants() ?? [];
        const removing = sampleView && descendants.includes(sampleView);
        const subtree = new Set(removing ? descendants : []);
        const entries =
            this.store.getState().provenance.present.paramProvenance.entries;
        /** @type {import("@genome-spy/core/view/viewSelectors.js").ResolvedParam[]} */
        const clearedOrigins = [];
        const retainedEntries = Object.fromEntries(
            Object.entries(entries).filter(([, entry]) => {
                const owner = resolveParamSelector(
                    this.genomeSpy.viewRoot,
                    entry.selector
                );
                const origin =
                    entry.origin ??
                    ("origin" in entry.value ? entry.value.origin : undefined);
                const removedOrigin =
                    origin &&
                    subtree.has(
                        resolveViewSelector(
                            this.genomeSpy.viewRoot,
                            origin.view
                        )
                    );
                if (owner && !subtree.has(owner.view) && removedOrigin)
                    clearedOrigins.push(owner);
                return !subtree.has(owner?.view) && !removedOrigin;
            })
        );
        const removedVisibilityKeys = new Set(
            Array.from(subtree).flatMap((view) =>
                [getViewVisibilityKey(view), view.explicitName].filter(Boolean)
            )
        );
        try {
            return await operation();
        } finally {
            if (
                !this.getSampleView() &&
                (removing ||
                    this.store.getState().provenance.present[sampleSlice.name]
                        .sampleData)
            ) {
                for (const { view, param } of clearedOrigins) {
                    view.paramRuntime.setValue(
                        param.name,
                        getDefaultParamValue(param, view.paramRuntime),
                        { animate: false }
                    );
                }
                this.store.dispatch(resetCohort(retainedEntries));
                if (removing) await this.#replacePersistenceContext(null);
                const visibilities = Object.fromEntries(
                    Object.entries(
                        this.store.getState().viewSettings.visibilities
                    ).filter(([key]) => !removedVisibilityKeys.has(key))
                );
                this.store.dispatch(
                    viewSettingsSlice.actions.setViewSettings({ visibilities })
                );
            }
        }
    }

    async #attachSampleView() {
        const sampleView = this.getSampleView();
        if (!sampleView || sampleView === this.#activeSampleView) return;
        this.#activeSampleView = sampleView;
        this.#sampleViewCandidate = undefined;
        try {
            await sampleView.ensureSampleIdentity();
        } catch (error) {
            // Core insertion succeeded, but this App-owned source could not load.
            // Remove directly inside the existing mutation; enqueuing would deadlock.
            const parent = sampleView.layoutParent;
            if (!(parent instanceof ConcatView)) throw error;
            await parent.removeChildAt(parent.children.indexOf(sampleView));
            this.store.dispatch(
                resetCohort(
                    this.store.getState().provenance.present.paramProvenance
                        .entries
                )
            );
            throw error;
        }
        try {
            await setupMetadataSourceRuntime(sampleView, this.intentPipeline);
        } catch (error) {
            if (this.#finalized) return;
            console.error(error);
            showMessageDialog(
                "Could not load initial metadata sources: " + String(error),
                {
                    title: "Metadata source warning",
                    type: "warning",
                }
            );
        }
        if (!this.#finalized && !sampleView.disposed) {
            await sampleView.metadataView?.whenMetadataSettled();
        }
    }

    #bindParamProvenance() {
        this.paramProvenanceBridge?.dispose();
        this.paramProvenanceBridge = new ParamProvenanceBridge({
            root: this.genomeSpy.viewRoot,
            store: this.store,
            intentExecutor: this.intentExecutor,
        });
    }

    /**
     * Returns the app-owned agent boundary.
     *
     * The module is loaded lazily so the boundary stays out of the default app
     * path when the agent feature is unused.
     *
     * @returns {Promise<import("./agentApi/index.js").AgentApi>}
     */
    getAgentApi() {
        if (!this.#agentApiPromise) {
            this.#agentApiPromise = import("./agentApi/index.js").then(
                (module) =>
                    /** @type {{
                     *     createAgentApi(app: import("./app.js").default): import("./agentApi/index.js").AgentApi;
                     * }} */ (/** @type {unknown} */ (module)).createAgentApi(
                        this
                    )
            );
        }

        return this.#agentApiPromise;
    }

    /**
     * Loads optional Core debug helpers from App's bundled Core instance.
     *
     * The inspector uses these modules to avoid loading a second Core copy,
     * which would break runtime identity checks and shared view ids.
     */
    async getDebugModules() {
        return import("@genome-spy/core/debug/index.js");
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

        // Seed a baseline marker so the first bookmarkable action is undoable.
        resetProvenanceHistory(this.store, paramProvenanceSlice.name);
    }

    #setupBookmarkDatabases() {
        // TODO: A registry for different types of bookmark sources

        /**
         * Local bookmarks in the IndexedDB
         * @type {IDBBookmarkDatabase | undefined}
         */
        this.localBookmarkDatabase = this.isEmbedded()
            ? undefined
            : typeof this.#persistenceConfig.specId == "string"
              ? new IDBBookmarkDatabase(this.#persistenceConfig.specId)
              : undefined;

        /**
         * Remote bookmarks loaded from a URL
         * @type {import("./bookmark/bookmarkDatabase.js").default}
         */
        this.globalBookmarkDatabase = undefined;
    }

    /** Base for bookmark-authored assets in the current source context. */
    get bookmarkBaseUrl() {
        return this.#persistenceConfig.baseUrl ?? "";
    }

    /**
     * Change source persistence independently of hierarchy mutation.
     * @param {import("./embedTypes.js").AppPersistenceContext | null} context
     */
    async setPersistenceContext(context) {
        const remoteUrl = context?.remoteBookmarks?.url;
        if (remoteUrl && !context.baseUrl && !URL.canParse(remoteUrl)) {
            throw new Error(
                "Relative remote bookmark URLs require a persistence baseUrl."
            );
        }
        await this.views.transaction(async () => {
            await this.#replacePersistenceContext(context);
            await this.#ensureRemoteBookmarks(this.#loadRemoteBookmarks());
        });
    }

    /** @param {import("./embedTypes.js").AppPersistenceContext | null} context */
    async #replacePersistenceContext(context) {
        this.#updateUrl.cancel();
        await this.localBookmarkDatabase?.close();
        this.#persistenceConfig = {
            specId: context?.specId,
            baseUrl: context?.baseUrl ?? "",
            bookmarks: context?.remoteBookmarks
                ? { remote: context.remoteBookmarks }
                : undefined,
        };
        this.#setupBookmarkDatabases();
    }

    /** @returns {Promise<import("./bookmark/databaseSchema.js").BookmarkEntry[]>} */
    #loadRemoteBookmarks() {
        const remote = this.#persistenceConfig.bookmarks?.remote;
        return this.isEmbedded() || !remote
            ? Promise.resolve([])
            : vegaLoader({ baseURL: this.bookmarkBaseUrl })
                  .load(remote.url)
                  .then((/** @type {string} */ value) => JSON.parse(value));
    }

    #observeScaleDomains() {
        for (const unsubscribe of this.#scaleSubscriptions) unsubscribe();
        this.#scaleSubscriptions.length = 0;
        if (this.isEmbedded()) return;
        for (const resolution of this.genomeSpy
            .getNamedScaleResolutions()
            .values()) {
            if (!resolution.isZoomable()) continue;
            resolution.addEventListener("domain", this.#updateUrl);
            this.#scaleSubscriptions.push(() =>
                resolution.removeEventListener("domain", this.#updateUrl)
            );
        }
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

        /** @type {Record<string, boolean>} */
        let cachedInput = EMPTY_VISIBILITIES;
        /** @type {import("@genome-spy/core/view/view.js").default | undefined} */
        let cachedRoot;
        let cachedRevision = -1;
        /** @type {Record<string, boolean>} */
        let cachedResolved = EMPTY_VISIBILITIES;

        const getResolvedVisibilities = () => {
            const input = visibilitiesSelector(this.store.getState());
            const root = this.genomeSpy.viewRoot;

            const revision = this.store.getState().lifecycle.hierarchyRevision;
            if (
                input === cachedInput &&
                root === cachedRoot &&
                revision === cachedRevision
            ) {
                return cachedResolved;
            }

            cachedInput = input;
            cachedRoot = root;
            cachedRevision = revision;
            cachedResolved = root
                ? resolveRadioVisibilityConflicts(root, input)
                : input;

            return cachedResolved;
        };

        const originalPredicate = this.genomeSpy.viewVisibilityPredicate;
        this.genomeSpy.viewVisibilityPredicate = (view) => {
            const override = getViewVisibilityOverride(
                getResolvedVisibilities(),
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

    isEmbedded() {
        return this.options.embedMode === "embedded";
    }

    finalize() {
        if (this.#finalized) {
            return;
        }
        this.#finalized = true;
        this.paramProvenanceBridge?.dispose();
        this.#updateUrl.cancel();
        for (const unsubscribe of this.#scaleSubscriptions) unsubscribe();
        this.#scaleSubscriptions.length = 0;
        void this.localBookmarkDatabase
            ?.close()
            .catch((error) => console.error(error));

        for (const disposer of Array.from(this.#disposers).reverse()) {
            disposer();
        }
        this.#disposers.clear();
        this.ui.dispose();
    }

    /**
     * @param {() => void} disposer
     */
    #registerDisposer(disposer) {
        this.#disposers.add(disposer);
    }

    /** @returns {Promise<boolean>} */
    async launch() {
        /**
         * Initiate async fetching of the remote bookmark entries.
         * @type {Promise<import("./bookmark/databaseSchema.js").BookmarkEntry[]>}
         */
        const remoteBookmarkPromise = this.#loadRemoteBookmarks();

        // Restore view visibility early so initial data/scale init honors bookmarks.
        // This avoids lazy-init races where in-flight loads miss newly visible branches.
        if (!this.isEmbedded()) {
            await this.#restoreViewSettingsFromUrlHash(remoteBookmarkPromise);
        }

        const result = await this.genomeSpy.launch();
        if (!result) {
            return false;
        }
        this.views = createViewMutationApi(
            this.genomeSpy,
            () => !this.#finalized,
            this.#runViewMutation.bind(this)
        );
        this.datumSearch = createDatumSearch(this.views);
        this.#showSelectorConstraintWarnings();

        const viewRoot = this.genomeSpy.viewRoot;
        if (!viewRoot) {
            throw new Error("No view root after launch");
        }

        this.#bindParamProvenance();
        viewRoot.registerDisposer(() => {
            this.paramProvenanceBridge.dispose();
        });
        this.provenance.addActionInfoSource((action) =>
            getParamActionInfo(action, viewRoot)
        );
        setupAppKeyboardShortcuts({
            viewRoot,
            shortcuts: createDefaultAppKeyboardShortcuts({
                provenance: this.provenance,
                focusSearchField: () => {
                    const searchField = this.appContainer.querySelector(
                        "genome-spy-search-field"
                    );
                    if (!searchField) {
                        return false;
                    }

                    if (
                        "focusInput" in searchField &&
                        typeof searchField.focusInput === "function"
                    ) {
                        searchField.focusInput();
                        return true;
                    } else {
                        return false;
                    }
                },
            }),
        });
        viewRoot.registerDisposer(
            setupSelectionExpansionContextMenu({
                viewRoot,
                intentExecutor: {
                    dispatch: (action) =>
                        this.runCohortOperation(() =>
                            this.intentExecutor.dispatch(action)
                        ),
                },
            })
        );

        await this.#attachSampleView();

        // Make it focusable so that keyboard shortcuts can be caught
        this.appContainer
            .querySelector("canvas")
            .setAttribute("tabindex", "-1");

        this.#registerDisposer(
            subscribeTo(
                this.store,
                (state) => state.viewSettings?.visibilities,
                withMicrotask(() => {
                    if (this.#finalized) {
                        return;
                    }
                    // TODO: Optimize: only invalidate the affected views
                    void this.genomeSpy.initializeVisibleViewData();
                    this.genomeSpy.viewRoot._invalidateCacheByPrefix(
                        "size",
                        "progeny"
                    );

                    const context = this.genomeSpy.viewRoot.context;
                    clearHiddenViewCoords(this.genomeSpy.viewRoot);
                    context.highlightView(null);
                    context.requestLayoutReflow();
                })
            )
        );
        this.#registerDisposer(
            attachIntentStatusUi({
                store: this.store,
                intentPipeline: this.intentPipeline,
                provenance: this.provenance,
            })
        );

        if (!this.isEmbedded()) {
            try {
                await this.#ensureRemoteBookmarks(remoteBookmarkPromise);
            } catch (e) {
                throw new Error(`Cannot load remote bookmarks: ${e}`, {
                    cause: e,
                });
            }

            try {
                await this._restoreStateFromUrlOrBookmark();
            } catch (e) {
                showMessageDialog(e.toString());
            }

            const onHashChange = () =>
                this._restoreStateFromUrl().catch((e) =>
                    showMessageDialog(e.toString())
                );
            window.addEventListener("hashchange", onHashChange, false);
            this.#registerDisposer(() =>
                window.removeEventListener("hashchange", onHashChange, false)
            );

            this.#registerDisposer(this.store.subscribe(this.#updateUrl));
            this.#observeScaleDomains();
        }

        const title = asArray(this.genomeSpy.spec.description ?? []);

        if (this.isFullPage() && title.length > 0) {
            document.title = "GenomeSpy - " + title;
        }

        this.store.dispatch(lifecycleSlice.actions.setInitialized());
        return true;
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
        } catch {
            // Ignore invalid hashes here; _restoreStateFromUrl handles reporting.
        }
    }

    /**
     * Restore state from url. If not restored, load a bookmark if requested in config.
     */
    async _restoreStateFromUrlOrBookmark() {
        const remoteConf = this.#persistenceConfig.bookmarks?.remote;
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

        hashData.scaleDomains = collectScaleDomains(
            this.genomeSpy,
            (scaleResolution) => scaleResolution.isZoomed()
        );

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
        return this.runCohortOperation(() => this.#restoreStateFromUrl());
    }

    async #restoreStateFromUrl() {
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
            const remoteConf = this.#persistenceConfig.bookmarks?.remote;
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
            const remoteConf = this.#persistenceConfig.bookmarks?.remote;
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
                remoteBookmarks,
                {
                    baseUrl: getRemoteBookmarkBaseUrl(this.#persistenceConfig),
                }
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
 * @param {Pick<import("./spec/appSpec.js").AppRootSpec, "baseUrl" | "bookmarks">} rootSpec
 */
export function getRemoteBookmarkBaseUrl(rootSpec) {
    const remoteConf = rootSpec.bookmarks?.remote;
    if (!remoteConf) {
        return undefined;
    }

    return getDirectory(concatUrl(rootSpec.baseUrl, remoteConf.url));
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

/**
 * Clears cached layout coordinates from views that are not effectively visible.
 *
 * Hidden views are skipped during layout/rendering and may otherwise keep stale
 * coordinates from earlier passes.
 *
 * @param {import("@genome-spy/core/view/view.js").default} viewRoot
 */
function clearHiddenViewCoords(viewRoot) {
    viewRoot.visit((view) => {
        if (!view.isVisible()) {
            view.facetCoords.clear();
        }
    });
}
