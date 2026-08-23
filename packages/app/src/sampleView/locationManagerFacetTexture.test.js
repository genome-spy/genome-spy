// @ts-check
import { describe, expect, test } from "vitest";

const { LocationManager } = await import("./locationManager.js");

describe("LocationManager placement source", () => {
    test("publishes complete topology with zero geometry when locations are unavailable", () => {
        const manager = createManager(0);
        const snapshot = manager.getPlacementSource().getSnapshot();

        expect(snapshot.topology.facetIds).toEqual([["s1"]]);
        expect(snapshot.rectangles).toEqual(new Float32Array([0, 0, 1, 0]));
    });

    test("keeps dense positions in the source without backend uploads", () => {
        const manager = createManager(100);
        const source = manager.getPlacementSource();
        const topologyRevision = source.getSnapshot().topology.revision;

        manager.getPlacementSource();
        expect(source.getSnapshot().topology.revision).toBe(topologyRevision);

        expect(manager.getSampleFacetPosition(0)).toEqual({
            location: expect.closeTo(0.1),
            size: expect.closeTo(0.8),
        });
        expect(manager.getSampleFacetPosition(1)).toBeUndefined();
        expect(source.getSnapshot().rectangles).toEqual(
            new Float32Array([0, 0.1, 1, 0.8])
        );
    });
});

function createManager(height) {
    const sampleIds = ["s1"];
    return new LocationManager({
        getSampleHierarchy: () => ({
            rootGroup: {
                name: "Root",
                title: "Root",
                groups: [{ name: "A", title: "Group A", samples: sampleIds }],
            },
            sampleData: {
                ids: sampleIds,
                entities: {
                    s1: { id: "s1", displayName: "S1", indexNumber: 0 },
                },
            },
            sampleMetadata: { attributeNames: [], entities: {} },
            groupMetadata: [],
        }),
        getHeight: () => height,
        getSummaryHeight: () => 0,
        onLocationUpdate: () => undefined,
        viewContext: /** @type {any} */ ({
            animator: {
                requestTransition: () => undefined,
                requestRender: () => undefined,
            },
        }),
        isStickySummaries: () => false,
    });
}
