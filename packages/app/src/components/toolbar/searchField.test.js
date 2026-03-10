// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import SearchField from "./searchField.js";

describe("SearchField", () => {
    it("initializes genome from the active locus scale without default genome lookup", () => {
        const genome = {
            formatInterval: vi.fn(() => "chr1:1-10"),
            parseInterval: vi.fn(),
        };
        const scale = {
            genome: vi.fn(() => genome),
        };
        const resolution = {
            type: "locus",
            isZoomable: () => true,
            getScale: vi.fn(() => scale),
            getDomain: vi.fn(() => [0, 10]),
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
        expect(scale.genome).toHaveBeenCalledTimes(1);
        expect(searchField._genome).toBe(genome);
        expect(searchField.getDefaultValue()).toBe("chr1:1-10");
        expect(genome.formatInterval).toHaveBeenCalledWith([0, 10]);
    });
});
