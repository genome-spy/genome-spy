// @ts-check
import { describe, expect, test, vi } from "vitest";

const textureMock = vi.hoisted(() => ({
    createOrUpdateTexture: vi.fn(() => ({ texture: true })),
}));

vi.mock("@genome-spy/core/gl/webGLHelper.js", () => textureMock);

const { LocationManager } = await import("./locationManager.js");

describe("LocationManager facet texture", () => {
    test("creates an empty facet texture when locations are unavailable", () => {
        const manager = new LocationManager({
            getSampleHierarchy: () => ({
                rootGroup: {
                    name: "Root",
                    title: "Root",
                    groups: [
                        {
                            name: "A",
                            title: "Group A",
                            samples: ["s1"],
                        },
                    ],
                },
                sampleData: {
                    ids: ["s1"],
                    entities: {
                        s1: {
                            id: "s1",
                            displayName: "S1",
                            indexNumber: 0,
                        },
                    },
                },
                sampleMetadata: {
                    attributeNames: [],
                    entities: {},
                },
                groupMetadata: [],
            }),
            getHeight: () => 0,
            getSummaryHeight: () => 0,
            onLocationUpdate: () => undefined,
            viewContext: /** @type {any} */ ({
                glHelper: { gl: {} },
                animator: {
                    requestTransition: () => undefined,
                    requestRender: () => undefined,
                },
            }),
            isStickySummaries: () => false,
        });

        manager.updateFacetTexture();

        expect(textureMock.createOrUpdateTexture).toHaveBeenCalled();
        expect(manager.getFacetTexture()).toEqual({ texture: true });
    });

    test("exposes facet positions without preventing a later texture upload", () => {
        const manager = new LocationManager({
            getSampleHierarchy: () => ({
                rootGroup: {
                    name: "Root",
                    title: "Root",
                    groups: [
                        {
                            name: "A",
                            title: "Group A",
                            samples: ["s1"],
                        },
                    ],
                },
                sampleData: {
                    ids: ["s1"],
                    entities: {
                        s1: {
                            id: "s1",
                            displayName: "S1",
                            indexNumber: 0,
                        },
                    },
                },
                sampleMetadata: {
                    attributeNames: [],
                    entities: {},
                },
                groupMetadata: [],
            }),
            getHeight: () => 100,
            getSummaryHeight: () => 0,
            onLocationUpdate: () => undefined,
            viewContext: /** @type {any} */ ({
                glHelper: { gl: {} },
                animator: {
                    requestTransition: () => undefined,
                    requestRender: () => undefined,
                },
            }),
            isStickySummaries: () => false,
        });

        expect(manager.getSampleFacetPosition(0)).toEqual({
            location: expect.closeTo(0.1),
            size: expect.closeTo(0.8),
        });
        expect(manager.getSampleFacetPosition(1)).toBeUndefined();

        textureMock.createOrUpdateTexture.mockClear();
        manager.updateFacetTexture();
        expect(textureMock.createOrUpdateTexture).toHaveBeenCalledOnce();
    });
});
