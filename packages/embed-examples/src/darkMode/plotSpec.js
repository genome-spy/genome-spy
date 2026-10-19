// A small plot to make theme changes visible. Its data colors stay fixed;
// titles, axes, chromosome guides, grid lines, and legend text use themeColors.
/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const plotSpec = {
    width: "container",
    height: 300,
    title: "One visualization, two appearances",
    genomes: {
        demo: {
            contigs: [
                { name: "chr1", size: 1_000_000 },
                { name: "chr2", size: 1_000_000 },
            ],
        },
    },
    assembly: "demo",
    data: {
        values: Array.from({ length: 30 }, (_, i) => ({
            chrom: i < 15 ? "chr1" : "chr2",
            pos: 50_000 + (i % 15) * 60_000,
            signal: 5 + Math.sin(i * 0.7) * 3,
        })),
    },
    mark: { type: "point", size: 100, filled: true },
    encoding: {
        x: {
            chrom: "chrom",
            pos: "pos",
            type: "locus",
            scale: { zoom: true },
        },
        y: {
            field: "signal",
            type: "quantitative",
            axis: { grid: true },
        },
        color: {
            field: "signal",
            type: "quantitative",
            scale: { scheme: "viridis" },
        },
        opacity: {
            condition: { param: "brush", value: 1 },
            value: 0.25,
        },
    },
};

export default plotSpec;
