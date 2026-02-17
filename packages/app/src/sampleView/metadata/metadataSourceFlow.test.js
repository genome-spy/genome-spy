import { afterEach, describe, expect, it, vi } from "vitest";
import { AUGMENTED_KEY } from "../../state/provenanceReducerBuilder.js";
import { sampleSlice } from "../state/sampleSlice.js";
import { augmentAddMetadataFromSourceAction } from "./metadataSourceFlow.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

/**
 * @param {import("@genome-spy/app/spec/sampleView.js").SampleDef["metadataSources"]} [metadataSources]
 * @param {string | undefined} [baseUrl]
 * @returns {import("../sampleView.js").default}
 */
function createSampleViewStub(metadataSources, baseUrl) {
    const sources = metadataSources ?? [
        {
            id: "clinical",
            backend: {
                backend: "data",
                data: {
                    values: [
                        { sample: "s1", TP53: 1.2 },
                        { sample: "s2", TP53: -0.2 },
                    ],
                },
            },
            attributes: {
                TP53: {
                    type: "quantitative",
                },
            },
        },
    ];

    return /** @type {import("../sampleView.js").default} */ (
        /** @type {unknown} */ ({
            actions: sampleSlice.actions,
            spec: {
                samples: {
                    metadataSources: sources,
                },
            },
            sampleHierarchy: {
                sampleData: {
                    ids: ["s1", "s2"],
                },
            },
            getBaseUrl: () => baseUrl,
        })
    );
}

describe("augmentAddMetadataFromSourceAction", () => {
    it("augments source actions with metadata payload", async () => {
        const sampleView = createSampleViewStub();
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "clinical",
            columnIds: ["TP53"],
        });

        const augmented = await augmentAddMetadataFromSourceAction(
            action,
            sampleView
        );

        expect(
            augmented.payload[AUGMENTED_KEY].metadata.columnarMetadata
        ).toEqual({
            sample: ["s1", "s2"],
            TP53: [1.2, -0.2],
        });
    });

    it("throws when source cannot be resolved", async () => {
        const sampleView = createSampleViewStub();
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "missing",
            columnIds: ["TP53"],
        });

        await expect(
            augmentAddMetadataFromSourceAction(action, sampleView)
        ).rejects.toThrow('Metadata source "missing" was not found.');
    });

    it("imports resolvable columns even when some requested columns are missing", async () => {
        const sampleView = createSampleViewStub();
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "clinical",
            columnIds: ["TP53", "MISSING"],
        });

        const augmented = await augmentAddMetadataFromSourceAction(
            action,
            sampleView
        );

        expect(
            augmented.payload[AUGMENTED_KEY].metadata.columnarMetadata
        ).toEqual({
            sample: ["s1", "s2"],
            TP53: [1.2, -0.2],
        });
    });

    it("throws when import size exceeds the limit", async () => {
        const sampleView = createSampleViewStub();
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "clinical",
            columnIds: Array.from({ length: 101 }, (_, i) => "col" + i),
        });

        await expect(
            augmentAddMetadataFromSourceAction(action, sampleView)
        ).rejects.toThrow("Metadata import exceeds the column limit (100).");
    });

    it("loads imported source definitions before augmenting metadata", async () => {
        const fetchMock = vi.fn();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
                id: "clinical",
                backend: {
                    backend: "data",
                    data: {
                        url: "../data/samples.tsv",
                    },
                    sampleIdField: "sample",
                },
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            text: async () => "sample\tTP53\ns1\t1.2\ns2\t-0.2\n",
        });
        vi.stubGlobal("fetch", fetchMock);

        const sampleView = createSampleViewStub(
            [{ import: { url: "metadata/clinical.json" } }],
            "https://example.org/spec/"
        );
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "clinical",
            columnIds: ["TP53"],
        });

        const augmented = await augmentAddMetadataFromSourceAction(
            action,
            sampleView
        );

        expect(
            augmented.payload[AUGMENTED_KEY].metadata.columnarMetadata
        ).toEqual({
            sample: ["s1", "s2"],
            TP53: [1.2, -0.2],
        });
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "https://example.org/spec/metadata/clinical.json",
            { signal: undefined }
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "https://example.org/spec/data/samples.tsv",
            { signal: undefined }
        );
    });

    it("integrates from augmentation to reducer-applied metadata", async () => {
        const sampleView = createSampleViewStub();
        const action = sampleSlice.actions.addMetadataFromSource({
            sourceId: "clinical",
            columnIds: ["TP53"],
        });

        const augmented = await augmentAddMetadataFromSourceAction(
            action,
            sampleView
        );

        let state = sampleSlice.reducer(
            undefined,
            sampleSlice.actions.setSamples({
                samples: [
                    { id: "s1", displayName: "s1", indexNumber: 0 },
                    { id: "s2", displayName: "s2", indexNumber: 1 },
                ],
            })
        );
        state = sampleSlice.reducer(state, augmented);

        expect(state.sampleMetadata.attributeNames).toEqual(["TP53"]);
        expect(state.sampleMetadata.entities.s1.TP53).toBe(1.2);
        expect(state.sampleMetadata.entities.s2.TP53).toBe(-0.2);
    });
});
