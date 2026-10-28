// @ts-check
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeViewData } from "@genome-spy/core/genomeSpy/viewDataInit.js";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory.js";
import { createSampleViewForTest } from "../../testUtils/appTestUtils.js";
import IntentPipeline from "../../state/intentPipeline.js";
import MergeSampleFacets from "../mergeFacets.js";
import { bootstrapInitialMetadataSources } from "./metadataSourceBootstrap.js";

transforms.mergeFacets = MergeSampleFacets;

afterEach(() => vi.unstubAllGlobals());

/**
 * @param {import("@genome-spy/app/spec/sampleView.js").SampleIdentityDef} identity
 * @param {Record<string, any>[]} rows
 * @returns {import("@genome-spy/app/spec/sampleView.js").SampleSpec}
 */
function spec(identity, rows) {
    return {
        data: { values: [{ sample: "from-signal", x: 1 }] },
        samples: { identity },
        metadata: {
            sources: [
                {
                    id: "panel",
                    initialLoad: false,
                    excludeColumns: ["rowLabel"],
                    backend: {
                        backend: "data",
                        data: { values: rows },
                        sampleIdField: "sid",
                    },
                },
            ],
        },
        spec: {
            mark: "point",
            encoding: {
                sample: { field: "sample" },
                x: { field: "x", type: "quantitative" },
            },
        },
    };
}

/** @param {Awaited<ReturnType<typeof createSampleViewForTest>>} fixture */
async function load(fixture) {
    await initializeViewData(
        /** @type {import("@genome-spy/core/view/view.js").default} */ (
            /** @type {unknown} */ (fixture.view)
        ),
        fixture.context.dataFlow,
        fixture.context.textMetrics,
        () => undefined
    );
}

/** @param {Awaited<ReturnType<typeof createSampleViewForTest>>} fixture */
function pipeline(fixture) {
    return new IntentPipeline({
        store: fixture.store,
        provenance: fixture.view.provenance,
        intentExecutor: fixture.view.intentExecutor,
    });
}

describe("metadata-backed sample identity", () => {
    it("initializes the fixed sample set and excluded labels before metadata attributes", async () => {
        const fixture = await createSampleViewForTest({
            initializeFlow: false,
            spec: spec(
                { metadataSource: "panel", displayNameField: "rowLabel" },
                [
                    { sid: "B", rowLabel: "Sample B", age: 12 },
                    { sid: "001", rowLabel: null, age: 11.5 },
                ]
            ),
        });
        const dispatch = vi.spyOn(fixture.store, "dispatch");
        await load(fixture);
        const state = fixture.view.sampleHierarchy;
        expect(state.sampleData.ids).toEqual(["B", "001"]);
        expect(state.sampleData.entities.B.displayName).toBe("Sample B");
        expect(state.sampleData.entities["001"].displayName).toBe("001");
        expect(fixture.view.paramRuntime.findValue("visibleSamples")).toEqual([
            "B",
            "001",
        ]);
        await bootstrapInitialMetadataSources(fixture.view, pipeline(fixture));
        expect(
            fixture.view.sampleHierarchy.sampleMetadata.attributeNames
        ).toEqual([]);

        // A native reload can replay the collector, but membership is initialized once.
        const source = fixture.context.dataFlow.dataSources.find(
            (s) => s.label === "metadataIdentitySource"
        );
        await source.load();
        expect(fixture.view.sampleHierarchy.sampleData).toBe(state.sampleData);
        expect(
            dispatch.mock.calls.filter(
                ([action]) => action.type === "sampleView/setSamples"
            )
        ).toHaveLength(1);
        fixture.view.disposeSubtree();
    });

    it("reuses imported source rows for shorthand identity and initial metadata columns", async () => {
        const rows = [
            { sid: "B", age: 12 },
            { sid: "001", age: 11.5 },
        ];
        const source = {
            id: "panel",
            initialLoad: "*",
            backend: {
                backend: "data",
                data: { url: "../samples.json" },
                sampleIdField: "sid",
            },
        };
        const fetch = vi.fn(
            async (url) =>
                new Response(
                    JSON.stringify(
                        url === "https://example.org/config/metadata.json"
                            ? source
                            : rows
                    )
                )
        );
        vi.stubGlobal("fetch", fetch);
        const specification = spec("metadata", []);
        specification.metadata.sources = [
            { import: { url: "https://example.org/config/metadata.json" } },
        ];
        const fixture = await createSampleViewForTest({
            spec: specification,
            initializeFlow: false,
        });
        await load(fixture);
        await bootstrapInitialMetadataSources(fixture.view, pipeline(fixture));
        expect(fixture.view.sampleHierarchy.sampleData.ids).toEqual([
            "B",
            "001",
        ]);
        expect(fixture.view.sampleHierarchy.sampleMetadata.entities).toEqual({
            B: { age: 12 },
            "001": { age: 11.5 },
        });
        expect(fetch.mock.calls.map(([url]) => url)).toEqual([
            "https://example.org/config/metadata.json",
            "https://example.org/samples.json",
        ]);
        fixture.view.disposeSubtree();
    });

    it("treats an empty resolved identity as an empty view", async () => {
        const fixture = await createSampleViewForTest({
            spec: spec("metadata", []),
            initializeFlow: false,
        });
        await load(fixture);
        expect(fixture.view.sampleHierarchy.sampleData.ids).toEqual([]);
        await bootstrapInitialMetadataSources(fixture.view, pipeline(fixture));
        expect(fixture.view.getSamples()).toEqual([]);
        fixture.view.disposeSubtree();
    });

    it.each([[{ sid: null }], [{}], [{ sid: "" }], [{ sid: 1 }, { sid: "1" }]])(
        "rejects invalid canonical ids before initializing samples: %j",
        async (...rows) => {
            const fixture = await createSampleViewForTest({
                spec: spec("metadata", rows),
                initializeFlow: false,
            });
            await expect(load(fixture)).rejects.toThrow(
                /empty sample id|duplicate sample ids/
            );
            expect(fixture.view.sampleHierarchy.sampleData).toBeUndefined();
            expect(
                fixture.context.dataFlow.loadingStatusRegistry.getSnapshot()
            ).toEqual([
                expect.objectContaining({
                    status: "error",
                    message: expect.stringMatching(
                        /empty sample id|duplicate sample ids/
                    ),
                }),
            ]);
            fixture.view.disposeSubtree();
        }
    );

    it("rejects ambiguous shorthand and missing source references during data initialization", async () => {
        const specification = spec("metadata", [{ sid: "B" }]);
        specification.metadata.sources.push({
            id: "other",
            backend: { backend: "data", data: { values: [] } },
        });
        const fixture = await createSampleViewForTest({
            spec: specification,
            initializeFlow: false,
        });
        await expect(load(fixture)).rejects.toThrow(
            "id is required when multiple sources"
        );
        expect(fixture.view.sampleHierarchy.sampleData).toBeUndefined();
        fixture.view.disposeSubtree();

        const missing = await createSampleViewForTest({
            spec: spec({ metadataSource: "missing" }, []),
            initializeFlow: false,
        });
        await expect(load(missing)).rejects.toThrow('"missing" was not found');
        missing.view.disposeSubtree();
    });

    it("aborts a pending identity read on disposal and never publishes its late response", async () => {
        /** @type {(response: Response) => void} */
        let finish;
        /** @type {AbortSignal} */
        let signal;
        const fetch = vi.fn((url, options) => {
            signal = options.signal;
            return new Promise((resolve) => {
                finish = resolve;
            });
        });
        vi.stubGlobal("fetch", fetch);
        const specification = spec("metadata", []);
        specification.metadata.sources = [
            {
                backend: {
                    backend: "data",
                    data: { url: "https://example.org/samples.json" },
                    sampleIdField: "sid",
                },
            },
        ];
        const fixture = await createSampleViewForTest({ spec: specification });
        const source = fixture.context.dataFlow.dataSources.find(
            (s) => s.label === "metadataIdentitySource"
        );
        const pending = source.load();
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        fixture.view.disposeSubtree();
        expect(signal.aborted).toBe(true);
        finish(new Response(JSON.stringify([{ sid: "B" }])));
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(fixture.view.sampleHierarchy.sampleData).toBeUndefined();
    });
});
