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

    test("keeps 2,000 stable placements through filtering, undo, and peek", async () => {
        const sampleIds = Array.from(
            { length: 2000 },
            (_, index) => `sample-${index}`
        );
        let activeSampleIds = sampleIds;
        const manager = createManagerWithSamples(
            500,
            sampleIds,
            () => activeSampleIds
        );
        const source = manager.getPlacementSource();
        const initial = source.getSnapshot();

        expect(initial.topology.facetIds).toHaveLength(2000);
        expect(initial.rectangles.byteLength).toBe(32000);
        expect(countVisiblePlacements(initial.rectangles)).toBe(2000);
        expect(manager.getPlacementIndex("sample-1999")).toBe(1999);

        activeSampleIds = [sampleIds[10], sampleIds[1999]];
        manager.resetLocations();
        manager.getPlacementSource();
        const filtered = source.getSnapshot();

        expect(filtered.topology.revision).toBe(initial.topology.revision);
        expect(filtered.geometryRevision).toBeGreaterThan(
            initial.geometryRevision
        );
        expect(filtered.rectangles.byteLength).toBe(32000);
        expect(countVisiblePlacements(filtered.rectangles)).toBe(2);
        expect(filtered.rectangles[10 * 4 + 3]).toBeGreaterThan(0);
        expect(filtered.rectangles[1000 * 4 + 3]).toBe(0);
        expect(filtered.rectangles[1999 * 4 + 3]).toBeGreaterThan(0);

        activeSampleIds = sampleIds;
        manager.resetLocations();
        manager.getPlacementSource();
        const restored = source.getSnapshot();

        expect(restored.topology.revision).toBe(initial.topology.revision);
        expect(restored.geometryRevision).toBeGreaterThan(
            filtered.geometryRevision
        );
        expect(restored.rectangles.byteLength).toBe(32000);
        expect(countVisiblePlacements(restored.rectangles)).toBe(2000);

        await manager.togglePeek(true, 250, sampleIds[1000]);
        manager.getPlacementSource();
        const peeked = source.getSnapshot();

        expect(manager.getPeekState()).toBe(1);
        expect(peeked.topology.revision).toBe(initial.topology.revision);
        expect(countViewportPlacements(peeked.rectangles)).toBeGreaterThan(0);
        expect(countViewportPlacements(peeked.rectangles)).toBeLessThan(30);
    });
});

function createManager(height) {
    const sampleIds = ["s1"];
    return createManagerWithSamples(height, sampleIds, () => sampleIds);
}

/**
 * @param {number} height
 * @param {string[]} sampleIds
 * @param {() => string[]} getActiveSampleIds
 */
function createManagerWithSamples(height, sampleIds, getActiveSampleIds) {
    const entities = Object.fromEntries(
        sampleIds.map((id, indexNumber) => [
            id,
            { id, displayName: `Sample ${indexNumber}`, indexNumber },
        ])
    );
    return new LocationManager({
        getSampleHierarchy: () => ({
            rootGroup: {
                name: "Root",
                title: "Root",
                groups: [
                    {
                        name: "A",
                        title: "Group A",
                        samples: getActiveSampleIds(),
                    },
                ],
            },
            sampleData: {
                ids: sampleIds,
                entities,
            },
            sampleMetadata: { attributeNames: [], entities: {} },
            groupMetadata: [],
        }),
        getHeight: () => height,
        getSummaryHeight: () => 0,
        onLocationUpdate: () => undefined,
        viewContext: /** @type {any} */ ({
            animator: {
                requestTransition: (callback) =>
                    callback(performance.now() + 1000),
                requestRender: () => undefined,
            },
        }),
        isStickySummaries: () => false,
    });
}

/** @param {Float32Array} rectangles */
function countVisiblePlacements(rectangles) {
    let count = 0;
    for (let index = 3; index < rectangles.length; index += 4) {
        if (rectangles[index] > 0) {
            count++;
        }
    }
    return count;
}

/** @param {Float32Array} rectangles */
function countViewportPlacements(rectangles) {
    let count = 0;
    for (let index = 0; index < rectangles.length; index += 4) {
        const y = rectangles[index + 1];
        const height = rectangles[index + 3];
        if (height > 0 && y < 1 && y + height > 0) {
            count++;
        }
    }
    return count;
}
