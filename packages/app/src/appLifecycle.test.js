// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import GenomeSpy from "@genome-spy/core/genomeSpy.js";
import GenomeStore from "@genome-spy/core/genome/genomeStore.js";
import { createHeadlessEngine } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import { initializeVisibleViewData } from "@genome-spy/core/genomeSpy/viewDataInit.js";
import { createTestViewContext } from "@genome-spy/core/view/testUtils.js";
import { findAncestorDataSource } from "@genome-spy/core/data/flowInit.js";
import { intervalSelection } from "@genome-spy/core/selection/index.js";
import { createSvg } from "@genome-spy/core/svg/index.js";
import { INTERNAL_DEFAULT_CONFIG } from "@genome-spy/core/config/defaultConfig.js";
import { resolveBaseConfig } from "@genome-spy/core/config/resolveConfig.js";
import {
    DEFAULT_THEME_NAME,
    resolveThemeSelection,
} from "@genome-spy/core/config/themes.js";
import {
    getParamSelector,
    getViewSelector,
} from "@genome-spy/core/view/viewSelectors.js";
import App from "./app.js";
import { sampleSlice } from "./sampleView/state/sampleSlice.js";
import { paramProvenanceSlice } from "./state/paramProvenanceSlice.js";
import { createBookmarkWithCurrentState } from "./bookmark/bookmarkState.js";
import { restoreBookmark } from "./bookmark/bookmark.js";
import { decompressFromUrlHash } from "./utils/urlHash.js";
import { createAgentApi } from "./agentApi/index.js";
import BaseDialog from "./components/generic/baseDialog.js";
import { ImportMetadataFromSourceDialog } from "./sampleView/metadata/importMetadataFromSourceDialog.js";

const figwigMetadata = vi.hoisted(() => ({
    getTracks: vi.fn(),
    close: vi.fn(),
}));

vi.mock("@genome-spy/figwig", () => ({
    FigWig: class {
        getTracks = figwigMetadata.getTracks;
        close = figwigMetadata.close;
    },
}));

// Exercise the real App shell and lifecycle while replacing only GPU startup.
vi.mock("@genome-spy/core/styles/genome-spy.css.js", () => ({ default: "" }));
// The browser loader has no filesystem fallback; keep its real HTTP path in Node.
vi.mock("vega-loader", async (importOriginal) => {
    const actual = /** @type {typeof import("vega-loader")} */ (
        await importOriginal()
    );
    return {
        ...actual,
        loader: (options) => actual.loader({ ...options, mode: "http" }),
    };
});

/** @type {App[]} */
const apps = [];

beforeEach(() => {
    window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
    );
    vi.spyOn(GenomeSpy.prototype, "launch").mockImplementation(
        async function () {
            const context = createTestViewContext(
                {},
                {
                    baseConfig: resolveBaseConfig({
                        defaultConfig: INTERNAL_DEFAULT_CONFIG,
                        builtInTheme: resolveThemeSelection(DEFAULT_THEME_NAME),
                    }),
                    genomeStore: new GenomeStore("."),
                    isViewConfiguredVisible: (view) =>
                        this.viewVisibilityPredicate(view),
                }
            );
            // Preserve App's SampleView factory for every recursive construction.
            context.createOrImportView = (
                spec,
                layoutParent,
                dataParent,
                name,
                validator,
                options
            ) =>
                this.viewFactory.createOrImportView(
                    spec,
                    context,
                    layoutParent,
                    dataParent,
                    name,
                    validator,
                    options
                );
            context.isViewSpec = (spec) => this.viewFactory.isViewSpec(spec);
            this.animator = context.animator;
            this.genomeStore = context.genomeStore;
            this.viewRoot = (
                await createHeadlessEngine(this.spec, { context })
            ).view;
            this.container.append(document.createElement("canvas"));
            return true;
        }
    );
    vi.spyOn(
        GenomeSpy.prototype,
        "initializeVisibleViewData"
    ).mockImplementation(async function () {
        const { context } = this.viewRoot;
        await initializeVisibleViewData(
            this.viewRoot,
            context.dataFlow,
            context.textMetrics
        );
    });
});

afterEach(() => {
    for (const app of apps.splice(0)) {
        app.finalize();
        app.genomeSpy.destroy();
        app.appContainer.remove();
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

/**
 * @param {import("@genome-spy/core/spec/parameter.js").Parameter[]} [params]
 * @param {import("./appTypes.js").AppEmbedOptions} [options]
 * @returns {Promise<App>}
 */
async function createApp(params = [], options = {}) {
    const container = document.createElement("div");
    document.body.append(container);
    const app = new App(
        container,
        {
            name: "host",
            params,
            scales: {
                x: {
                    name: "locus",
                    type: "locus",
                    assembly: { contigs: [{ name: "chrA", size: 1000 }] },
                    domain: [0, 1000],
                    zoom: true,
                },
            },
            vconcat: [
                {
                    name: "annotation",
                    data: { values: [{ chrom: "chrA", pos: 100 }] },
                    mark: "point",
                    encoding: {
                        x: { chrom: "chrom", pos: "pos", type: "locus" },
                    },
                },
            ],
        },
        { embedMode: "embedded", ...options }
    );
    apps.push(app);
    expect(await app.launch()).toBe(true);
    return app;
}

/**
 * @param {"A" | "B"} dataset
 * @returns {import("./spec/sampleView.js").SampleSpec}
 */
function cohortSpec(dataset) {
    const rows =
        dataset === "A"
            ? [
                  { sample: "s1", status: "control", oldOnly: 1 },
                  { sample: "s2", status: "case", oldOnly: 2 },
              ]
            : [
                  { sample: "s1", status: "new-one", newOnly: 3 },
                  { sample: "s2", status: "new-two", newOnly: 4 },
              ];
    return {
        name: "cohort",
        params: [
            {
                name: "threshold",
                value: 1,
                bind: { input: "range", min: 0, max: 10 },
            },
        ],
        samples: { identity: "metadata" },
        metadata: {
            sources: [
                {
                    id: "panel",
                    initialLoad: dataset === "A" ? ["status"] : "*",
                    backend: { backend: "data", data: { values: rows } },
                },
            ],
        },
        data: {
            values: rows.map(({ sample }, index) => ({
                sample,
                chrom: "chrA",
                pos: 200 + index * 100,
            })),
        },
        spec: {
            name: "signal",
            params: [
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x"] },
                },
            ],
            mark: "point",
            encoding: {
                sample: { field: "sample" },
                x: { chrom: "chrom", pos: "pos", type: "locus" },
            },
        },
    };
}

const statusAttribute = { type: "SAMPLE_ATTRIBUTE", specifier: "status" };

test("replaces complete cohorts while retaining annotation data, locus and App shell", async () => {
    const app = await createApp();
    const parent = app.views.root();
    const shell = app.appContainer.querySelector(".genome-spy-app");
    const toolbar = app.appContainer.querySelector("genome-spy-toolbar");
    const annotation =
        app.genomeSpy.viewRoot.findDescendantByName("annotation");
    const collector = annotation.flowHandle.collector;
    const rows = Array.from(collector.getData());
    const sourceLoad = vi.spyOn(findAncestorDataSource(collector), "load");
    const locus = annotation.getScaleResolution("x");
    await locus.zoomTo([200, 400]);
    const navigatedLocus = Array.from(locus.getDomain());
    expect(app.getSampleView()).toBeUndefined();

    // Exercise signal-derived identities before replacing with metadata identities.
    const firstSpec = cohortSpec("A");
    firstSpec.samples = {};
    const firstHandle = await app.views.insert(parent, firstSpec);
    const first = app.getSampleView();
    expect(first.sampleHierarchy.sampleMetadata.attributeNames).toEqual([
        "status",
    ]);
    await app.runCohortOperation(() =>
        app.intentPipeline.submit([
            sampleSlice.actions.addMetadataFromSource({
                sourceId: "panel",
                columnIds: ["oldOnly"],
            }),
            sampleSlice.actions.groupByNominal({ attribute: statusAttribute }),
            sampleSlice.actions.filterByNominal({
                attribute: statusAttribute,
                values: ["control"],
                remove: false,
            }),
        ])
    );
    expect(first.leafSamples).toEqual(["s1"]);
    expect(first.sampleHierarchy.groupMetadata).not.toHaveLength(0);
    const firstSignal = app.views.resolve({ scope: [], view: "signal" });
    firstSignal.params
        .get("brush")
        .setValue(intervalSelection({ x: [250, 350] }));
    expect(firstSignal.params.getSelection("brush").getValue()).toMatchObject({
        type: "interval",
        active: true,
    });
    first.paramRuntime.setValue("threshold", 8);
    await app.paramProvenanceBridge.whenApplied();
    app.provenance.undo();
    expect(app.provenance.isRedoable()).toBe(true);

    await app.views.transaction(async (views) => {
        await views.remove(firstHandle);
        await views.insert(parent, cohortSpec("B"));
    });

    const second = app.getSampleView();
    expect(second).not.toBe(first);
    expect(second.sampleHierarchy.sampleData.ids).toEqual(["s1", "s2"]);
    expect(second.sampleHierarchy.sampleMetadata.attributeNames).toEqual([
        "status",
        "newOnly",
    ]);
    expect(second.sampleHierarchy.sampleMetadata.entities.s1).toMatchObject({
        status: "new-one",
        newOnly: 3,
    });
    expect(
        second.sampleHierarchy.sampleMetadata.entities.s1.oldOnly
    ).toBeUndefined();
    expect(second.leafSamples).toEqual(["s1", "s2"]);
    expect(second.sampleHierarchy.groupMetadata).toEqual([]);
    expect(second.paramRuntime.getValue("threshold")).toBe(1);
    expect(
        app.views
            .resolve({ scope: [], view: "signal" })
            .params.getSelection("brush")
            .getValue()
    ).toMatchObject({ type: "interval", active: false });
    expect(app.provenance.isUndoable()).toBe(false);
    expect(app.provenance.isRedoable()).toBe(false);
    expect(app.genomeSpy.viewRoot.findDescendantByName("annotation")).toBe(
        annotation
    );
    expect(annotation.flowHandle.collector).toBe(collector);
    expect(Array.from(collector.getData())).toEqual(rows);
    expect(annotation.getScaleResolution("x")).toBe(locus);
    expect(locus.getDomain()).toEqual(navigatedLocus);
    expect(sourceLoad).not.toHaveBeenCalled();
    expect(app.appContainer.querySelector(".genome-spy-app")).toBe(shell);
    expect(app.appContainer.querySelector("genome-spy-toolbar")).toBe(toolbar);

    // Export must traverse the current cohort and its retained annotation sibling.
    const { svg, warnings } = createSvg({
        viewRoot: app.genomeSpy.viewRoot,
        logicalWidth: 640,
        logicalHeight: 360,
    });
    const labels = Array.from(
        svg.querySelectorAll("text"),
        (text) => text.textContent
    );
    expect(labels).toContain("newOnly");
    expect(labels).not.toContain("oldOnly");
    expect(
        svg.querySelector('[data-name="attribute-newOnly-value"] rect')
    ).not.toBeNull();
    expect(svg.querySelector('[data-name="annotation"]')).not.toBeNull();
    expect(warnings).toEqual([]);
});

test("rejects extra and nested cohorts through transactions and recovers from construction failure", async () => {
    const app = await createApp();
    const parent = app.views.root();
    const invalid = cohortSpec("A");
    invalid.spec = { mark: /** @type {any} */ ("missing") };
    await expect(app.views.insert(parent, invalid)).rejects.toThrow(
        "No such mark"
    );
    expect(app.getSampleView()).toBeUndefined();

    const failedIdentity = cohortSpec("A");
    failedIdentity.samples.identity = {
        data: { values: [{ sample: "s1" }, { sample: "s1" }] },
    };
    await expect(app.views.insert(parent, failedIdentity)).rejects.toThrow(
        "duplicate sample ids"
    );
    expect(app.getSampleView()).toBeUndefined();

    const firstHandle = await app.views.insert(parent, cohortSpec("A"));
    const first = app.getSampleView();
    const state = app.store.getState().provenance;
    await expect(
        app.views.transaction((views) =>
            views.insert(parent, {
                vconcat: [cohortSpec("B")],
            })
        )
    ).rejects.toThrow();
    expect(app.getSampleView()).toBe(first);
    expect(app.store.getState().provenance).toBe(state);

    await app.views.remove(firstHandle);
    const nested = cohortSpec("A");
    nested.spec = /** @type {any} */ (cohortSpec("B"));
    await expect(app.views.insert(parent, nested)).rejects.toThrow();
    expect(app.getSampleView()).toBeUndefined();
    const bundle = await app.views.insert(parent, {
        name: "bundle",
        templates: { dataset: /** @type {any} */ (cohortSpec("B")) },
        vconcat: [{ import: { template: "dataset" } }],
    });
    expect(
        app.getSampleView().sampleHierarchy.sampleMetadata.entities.s1.status
    ).toBe("new-one");
    await app.views.remove(bundle);
    expect(app.getSampleView()).toBeUndefined();
    expect(
        app.store.getState().provenance.present.sampleView.sampleData
    ).toBeUndefined();
});

test("drains accepted work while allowing its remaining pipeline actions and rejecting new operations", async () => {
    const app = await createApp();
    const handle = await app.views.insert(app.views.root(), cohortSpec("A"));
    const first = app.getSampleView();
    /** @type {PromiseWithResolvers<void>} */
    const release = Promise.withResolvers();
    const accepted = app.runCohortOperation(async () => {
        await release.promise;
        await app.intentPipeline.submit(
            sampleSlice.actions.addMetadata({
                columnarMetadata: { sample: ["s1", "s2"], accepted: [1, 2] },
            })
        );
    });
    const removal = app.views.remove(handle);
    await vi.waitFor(() =>
        expect(app.store.getState().lifecycle.cohortTransitioning).toBe(true)
    );
    expect(app.getSampleView()).toBe(first);
    expect(() => app.runCohortOperation(() => undefined)).toThrow();

    release.resolve();
    await accepted;
    await removal;

    expect(app.getSampleView()).toBeUndefined();
    expect(
        app.store.getState().provenance.present.sampleView.sampleData
    ).toBeUndefined();
    expect(app.store.getState().lifecycle.cohortTransitioning).toBe(false);
    await app.views.insert(app.views.root(), cohortSpec("B"));
    expect(
        app.getSampleView().sampleHierarchy.sampleMetadata.attributeNames
    ).toEqual(["status", "newOnly"]);
});

test.each(["agent summaries", "source dialog"])(
    "removal awaits %s metadata reads and reader closure",
    async (entrypoint) => {
        const app = await createApp();
        const spec = cohortSpec("A");
        spec.samples.identity = { metadataSource: "panel" };
        const source = {
            id: "figwig",
            initialLoad: /** @type {const} */ (false),
            backend: {
                backend: /** @type {const} */ ("figwig"),
                url: "blob:metadata",
            },
        };
        spec.metadata.sources.push(source);
        const handle = await app.views.insert(app.views.root(), spec);
        const sampleView = app.getSampleView();
        const admission = vi.spyOn(sampleView, "runCohortOperation");
        const read = Promise.withResolvers();
        const close = Promise.withResolvers();
        figwigMetadata.getTracks.mockReset().mockReturnValue(read.promise);
        figwigMetadata.close.mockReset().mockReturnValue(close.promise);

        let query;
        let dialog;
        if (entrypoint === "agent summaries") {
            query = createAgentApi(app).getMetadataSourceSummaries();
        } else {
            // jsdom has no native dialog opening; keep the real Lit content.
            vi.spyOn(BaseDialog.prototype, "firstUpdated").mockImplementation(
                () => undefined
            );
            dialog = new ImportMetadataFromSourceDialog();
            dialog.sampleView = sampleView;
            dialog.source = source;
            document.body.append(dialog);
            await dialog.updateComplete;
            const change = Object.assign(new Event("change"), {
                values: ["status"],
            });
            dialog.shadowRoot
                .querySelector("#columnInput")
                .dispatchEvent(change);
            expect(admission).toHaveBeenCalledTimes(2);
        }

        await vi.waitFor(() =>
            expect(figwigMetadata.getTracks).toHaveBeenCalledOnce()
        );
        const removal = app.views.remove(handle);
        await vi.waitFor(() =>
            expect(app.store.getState().lifecycle.cohortTransitioning).toBe(
                true
            )
        );
        expect(app.getSampleView()).toBe(sampleView);

        read.resolve([{ name: "s1", metadata: { status: "case" } }]);
        await vi.waitFor(() =>
            expect(figwigMetadata.close).toHaveBeenCalledOnce()
        );
        expect(app.getSampleView()).toBe(sampleView);
        close.resolve();
        await query;
        await removal;
        expect(app.getSampleView()).toBeUndefined();
        dialog?.remove();
    }
);

test("clears the last surviving selection when its cohort origin is removed", async () => {
    const app = await createApp([
        { name: "region", select: { type: "interval", encodings: ["x"] } },
    ]);
    const root = app.genomeSpy.viewRoot;
    const owner = root.findDescendantByName("host");
    const parent = app.views.get(getViewSelector(owner));
    const handle = await app.views.insert(parent, cohortSpec("A"));
    const selection = parent.params.getSelection("region");
    const signal = root.findDescendantByName("signal");
    app.intentExecutor.dispatch(
        paramProvenanceSlice.actions.paramChange({
            selector: getParamSelector(owner, "region"),
            value: { type: "interval", intervals: { x: [200, 300] } },
            origin: {
                type: "datum",
                view: getViewSelector(signal),
                keyField: "sample",
                key: "s1",
                intervalSources: { x: { start: "pos", end: "pos" } },
            },
        })
    );
    await app.paramProvenanceBridge.whenApplied();
    expect(selection.getValue()).toMatchObject({ active: true });
    expect(
        Object.keys(
            app.store.getState().provenance.present.paramProvenance.entries
        )
    ).toHaveLength(1);

    await app.views.remove(handle);

    expect(
        app.store.getState().provenance.present.paramProvenance.entries
    ).toEqual({});
    expect(selection.getValue()).toMatchObject({ active: false });
});

test("retains the latest independent input value when its capture is still throttled", async () => {
    const params = [
        {
            name: "independentThreshold",
            value: 1,
            bind: { input: "range", min: 0, max: 10 },
        },
    ];
    const app = await createApp(params);
    const handle = await app.views.insert(app.views.root(), cohortSpec("A"));
    const runtime = app.genomeSpy.viewRoot.paramRuntime;
    vi.useFakeTimers();
    try {
        runtime.setValue("independentThreshold", 3);
        await runtime.whenPropagated();
        runtime.setValue("independentThreshold", 8);
        await runtime.whenPropagated();
        expect(runtime.getValue("independentThreshold")).toBe(8);

        await app.views.remove(handle);

        expect(runtime.getValue("independentThreshold")).toBe(8);
        const entries =
            app.store.getState().provenance.present.paramProvenance.entries;
        expect(
            Object.values(entries).find(
                (entry) => entry.selector.param === "independentThreshold"
            ).value
        ).toEqual({ type: "value", value: 8 });
        await vi.advanceTimersByTimeAsync(150);
        expect(app.provenance.isUndoable()).toBe(false);

        const bookmark = createBookmarkWithCurrentState(app);
        expect(bookmark.actions).toEqual([
            expect.objectContaining({
                type: paramProvenanceSlice.actions.paramChange.type,
                payload: expect.objectContaining({
                    value: { type: "value", value: 8 },
                }),
            }),
        ]);
        const fresh = await createApp(params);
        await restoreBookmark(bookmark, fresh);
        expect(
            fresh.genomeSpy.viewRoot.paramRuntime.getValue(
                "independentThreshold"
            )
        ).toBe(8);
        expect(fresh.getSampleView()).toBeUndefined();
    } finally {
        vi.useRealTimers();
    }
});

test("switches source bookmark contexts and clears old hash actions while preserving navigation", async () => {
    const fetchBookmarks = vi.fn(
        async () =>
            new Response(
                JSON.stringify([
                    {
                        name: "Saved view",
                        notes: "![relative image](figure.png)",
                        actions: [
                            sampleSlice.actions.addMetadata({
                                columnarMetadata: {
                                    sample: ["s1"],
                                    remoteLeak: [true],
                                },
                            }),
                        ],
                    },
                ])
            )
    );
    vi.stubGlobal("fetch", fetchBookmarks);
    const app = await createApp([], { embedMode: "standalone" });
    await expect(
        app.setPersistenceContext({ remoteBookmarks: { url: "list.json" } })
    ).rejects.toThrow("baseUrl");
    await app.setPersistenceContext({
        specId: "dataset-a",
        baseUrl: "https://example.org/a/",
        remoteBookmarks: { url: "notes/list.json" },
    });
    const firstDatabase = app.localBookmarkDatabase;
    const close = vi.spyOn(firstDatabase, "close");
    expect(firstDatabase).toMatchObject({ specId: "dataset-a" });
    expect(app.globalBookmarkDatabase.baseUrl).toBe(
        "https://example.org/a/notes/"
    );
    expect(await app.globalBookmarkDatabase.getNames()).toEqual(["Saved view"]);

    const handle = await app.views.insert(app.views.root(), cohortSpec("A"));
    const locus = app.genomeSpy.getNamedScaleResolutions().get("locus");
    await locus.zoomTo([200, 400]);
    await app.runCohortOperation(() =>
        app.intentPipeline.submit(
            sampleSlice.actions.filterByNominal({
                attribute: statusAttribute,
                values: ["control"],
                remove: false,
            })
        )
    );
    app._updateStateToUrl();
    const previousHash = decompressFromUrlHash(window.location.hash);
    expect(previousHash.actions).not.toHaveLength(0);

    await app.views.remove(handle);
    await vi.waitFor(() =>
        expect(decompressFromUrlHash(window.location.hash).actions).toEqual([])
    );
    expect(decompressFromUrlHash(window.location.hash).scaleDomains).toEqual(
        previousHash.scaleDomains
    );
    expect(close).toHaveBeenCalledOnce();
    expect(app.localBookmarkDatabase).toBeUndefined();
    expect(app.globalBookmarkDatabase).toBeUndefined();

    await app.setPersistenceContext({
        specId: "dataset-b",
        baseUrl: "https://example.org/b/",
        remoteBookmarks: { url: "bookmarks.json" },
    });
    const secondDatabase = app.localBookmarkDatabase;
    const invalid = cohortSpec("B");
    invalid.samples.identity = {
        data: { values: [{ sample: "s1" }, { sample: "s1" }] },
    };
    await expect(app.views.insert(app.views.root(), invalid)).rejects.toThrow(
        "duplicate sample ids"
    );
    expect(app.localBookmarkDatabase).toBe(secondDatabase);
    expect(app.globalBookmarkDatabase.baseUrl).toBe("https://example.org/b/");
    await app.views.insert(app.views.root(), cohortSpec("B"));
    expect(secondDatabase).toMatchObject({ specId: "dataset-b" });
    expect(
        app.getSampleView().sampleHierarchy.sampleMetadata.attributeNames
    ).toEqual(["status", "newOnly"]);
    expect(fetchBookmarks.mock.calls.map(([url]) => String(url))).toEqual([
        "https://example.org/a/notes/list.json",
        "https://example.org/b/bookmarks.json",
    ]);
    await app.setPersistenceContext(null);
    expect(app.localBookmarkDatabase).toBeUndefined();
    expect(app.globalBookmarkDatabase).toBeUndefined();
});

test("embedded persistence changes do not own bookmark storage or the page URL", async () => {
    const fetchBookmarks = vi.fn();
    vi.stubGlobal("fetch", fetchBookmarks);
    const app = await createApp();
    const replaceState = vi.spyOn(window.history, "replaceState");
    await app.setPersistenceContext({
        specId: "embedded-source",
        remoteBookmarks: { url: "https://example.org/bookmarks.json" },
    });
    await app.views.insert(app.views.root(), cohortSpec("A"));

    expect(app.localBookmarkDatabase).toBeUndefined();
    expect(app.globalBookmarkDatabase).toBeUndefined();
    expect(fetchBookmarks).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
});

test("URL persistence observes named scales inserted after launch and releases them on removal", async () => {
    const app = await createApp([], { embedMode: "standalone" });
    const handle = await app.views.insert(app.views.root(), {
        name: "independent-track",
        scales: {
            y: {
                name: "additional",
                type: "linear",
                domain: [0, 100],
                zoom: true,
            },
        },
        data: { values: [{ value: 25 }] },
        mark: "point",
        encoding: { y: { field: "value", type: "quantitative" } },
    });
    const scale = app.genomeSpy.getNamedScaleResolutions().get("additional");
    const removeListener = vi.spyOn(scale, "removeEventListener");
    await scale.zoomTo([10, 20]);
    await vi.waitFor(() =>
        expect(
            decompressFromUrlHash(window.location.hash).scaleDomains.additional
        ).toEqual([10, 20])
    );

    await app.views.remove(handle);
    expect(removeListener).toHaveBeenCalledWith("domain", expect.any(Function));
    await vi.waitFor(() => {
        const state = window.location.hash
            ? decompressFromUrlHash(window.location.hash)
            : { scaleDomains: {} };
        expect(state.scaleDomains).not.toHaveProperty("additional");
    });
});
