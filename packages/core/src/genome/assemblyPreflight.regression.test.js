import { afterEach, describe, expect, test, vi } from "vitest";
import { initializeViewSubtree } from "../data/flowInit.js";
import { createTestViewContext } from "../view/testUtils.js";
import { VIEW_ROOT_NAME, ViewFactory } from "../view/viewFactory.js";
import { ensureAssembliesForView } from "./assemblyPreflight.js";

describe("assembly preflight import regression", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("loads the default configured assembly before imported transforms access locus scales", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url) => {
                if (url === "https://example.org/specs/child.json") {
                    return /** @type {any} */ ({
                        ok: true,
                        json: async () => ({
                            data: {
                                values: [
                                    {
                                        chrom: "chr1",
                                        start: 1,
                                        length: 2,
                                    },
                                ],
                            },
                            transform: [
                                {
                                    type: "linearizeGenomicCoordinate",
                                    chrom: "chrom",
                                    pos: "start",
                                    as: "_start",
                                },
                            ],
                            encoding: {
                                y: {
                                    field: "_start",
                                    type: "quantitative",
                                },
                            },
                            layer: [
                                {
                                    mark: "point",
                                    encoding: {
                                        x: {
                                            field: "_start",
                                            type: "locus",
                                        },
                                    },
                                },
                            ],
                        }),
                    });
                }

                if (url === "https://example.org/custom.chrom.sizes") {
                    return /** @type {any} */ ({
                        ok: true,
                        text: async () => "chr1\t10\n",
                    });
                }

                throw new Error(`Unexpected URL: ${url}`);
            });

        const context = createTestViewContext({
            allowImport: true,
            wrapRoot: false,
        });
        context.isViewSpec = (spec) =>
            new ViewFactory().isViewSpec(
                /** @type {import("../spec/view.js").ViewSpec} */ (spec)
            );
        context.genomeStore.baseUrl = "https://example.org/";
        context.genomeStore.configureGenomes(
            new Map([
                [
                    "custom",
                    {
                        url: "custom.chrom.sizes",
                    },
                ],
            ]),
            "custom"
        );

        const view = await context.createOrImportView(
            /** @type {any} */ ({
                baseUrl: "https://example.org/",
                vconcat: [
                    {
                        import: {
                            url: "specs/child.json",
                        },
                    },
                ],
            }),
            null,
            null,
            "root"
        );

        await ensureAssembliesForView(view, context.genomeStore);

        expect(() =>
            initializeViewSubtree(view, context.dataFlow)
        ).not.toThrow();
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("implicit root interval selections do not access default locus assemblies before preflight", async () => {
        const context = createTestViewContext({
            wrapRoot: true,
        });
        context.genomeStore.baseUrl = "https://example.org/";
        context.genomeStore.configureGenomes(
            new Map([
                [
                    "custom",
                    {
                        url: "custom.chrom.sizes",
                    },
                ],
            ]),
            "custom"
        );

        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            /** @type {any} */ ({
                ok: true,
                text: async () => "chr1\t10\n",
            })
        );

        const view = await context.createOrImportView(
            /** @type {any} */ ({
                params: [
                    {
                        name: "brush",
                        select: {
                            type: "interval",
                            encodings: ["x"],
                        },
                    },
                ],
                data: {
                    values: [{ chrom: "chr1", pos: 1, value: 1 }],
                },
                mark: "point",
                encoding: {
                    x: {
                        chrom: "chrom",
                        pos: "pos",
                        type: "locus",
                        scale: { type: "locus" },
                    },
                    y: {
                        field: "value",
                        type: "quantitative",
                    },
                },
            }),
            null,
            null,
            VIEW_ROOT_NAME
        );

        expect(() => view.getScaleResolution("x").isZoomable()).not.toThrow();
        expect(view.getScaleResolution("x").isZoomable()).toBe(true);

        await ensureAssembliesForView(view, context.genomeStore);

        expect(() =>
            initializeViewSubtree(view, context.dataFlow)
        ).not.toThrow();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});
