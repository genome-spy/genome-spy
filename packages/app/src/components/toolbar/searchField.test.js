// @vitest-environment jsdom
import { createTestEmbed } from "@genome-spy/core/view/embedTestUtils.js";
import { createDatumSearch } from "@genome-spy/core/search";
import { describe, expect, it, vi } from "vitest";
import SearchField from "./searchField.js";

describe("SearchField", () => {
    it("initializes genome from the active locus scale without default genome lookup", () => {
        const resolution = {
            type: "locus",
            isZoomable: () => true,
            getAssembly: vi.fn(() => ({
                contigs: [{ name: "chr1", size: 100 }],
            })),
            getComplexDomain: vi.fn(() => [
                { chrom: "chr1", pos: 0 },
                { chrom: "chr1", pos: 9 },
            ]),
            zoomTo: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };

        // Non-obvious: use a minimal visit() implementation so findGenomeScaleResolution()
        // can discover a zoomable x locus resolution without constructing a real view tree.
        const viewRoot = {
            visit: (visitor) =>
                visitor({
                    resolutions: {
                        scale: {
                            x: resolution,
                        },
                    },
                }),
        };

        const defaultGenomeLookup = vi.fn(() => {
            throw new Error("getGenome() should not be called");
        });

        const searchField = new SearchField();
        searchField.app = /** @type {any} */ ({
            genomeSpy: {
                viewRoot,
                genomeStore: {
                    getGenome: defaultGenomeLookup,
                },
            },
        });

        searchField._initializeGenome();

        expect(defaultGenomeLookup).not.toHaveBeenCalled();
        expect(searchField.getDefaultValue()).toBe("chr1:1-10");
        searchField.inputRef.value = document.createElement("input");
        return searchField.search("chr1:10-20").then(() => {
            expect(resolution.zoomTo).toHaveBeenCalledWith([
                { chrom: "chr1", pos: 9 },
                { chrom: "chr1", pos: 19 },
            ]);
        });
    });
});

it("keeps padded first- and last-base gene navigation inside the active assembly", async () => {
    const { root, views } = await createTestEmbed({
        data: {
            values: [
                { symbol: "FIRST", pos: 0 },
                { symbol: "LAST", pos: 99 },
            ],
        },
        mark: "point",
        encoding: {
            x: {
                field: "pos",
                type: "locus",
                scale: {
                    assembly: { contigs: [{ name: "scaffold", size: 100 }] },
                    zoom: true,
                },
            },
            search: { field: "symbol" },
        },
    });
    const field = new SearchField();
    field.app = /** @type {any} */ ({
        genomeSpy: { viewRoot: root },
        datumSearch: createDatumSearch(views),
    });
    field.inputRef.value = document.createElement("input");
    field._initializeGenome();
    const resolution = root.getScaleResolution("x");
    for (const term of ["FIRST", "LAST"]) {
        await field.search(term);
        const [begin, end] = resolution.getDomain();
        expect(begin).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual(100);
        expect(end).toBeGreaterThan(begin);
        expect(field.getDefaultValue()).toMatch(/^scaffold:\d+-\d+$/);
    }
});
