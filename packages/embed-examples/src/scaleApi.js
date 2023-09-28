import { embed } from "@genome-spy/core";
import { html, render } from "lit";

/** @type {import("@genome-spy/core/spec/root").RootSpec} */
const spec = {
    height: 50,
    genome: { name: "hg38" },
    data: {
        values: [
            { chrom: "chr3", pos: 134567890 },
            { chrom: "chr4", pos: 123456789 },
            { chrom: "chr9", pos: 34567890 },
        ],
    },
    mark: "point",
    encoding: {
        x: {
            chrom: "chrom",
            pos: "pos",
            type: "locus",
            scale: {
                name: "genomeScale",
                domain: [{ chrom: "chr3" }, { chrom: "chr9" }],
            },
        },
        size: { value: 200 },
    },
};

const container = document.getElementById("container");
const dashboard = document.getElementById("dashboard");

/**
 * @param {import("@genome-spy/core/types/scaleResolutionApi").ScaleResolutionApi} genomeScale
 */
function updateDashboard(genomeScale) {
    render(
        html`
            <p>Current domain: ${JSON.stringify(genomeScale.getDomain())}</p>
            <p>
                Current domain (complex):
                ${JSON.stringify(genomeScale.getComplexDomain())}
            </p>
            <p>
                Zoom to:
                <button
                    @click=${() =>
                        genomeScale.zoomTo([
                            { chrom: "chr4" },
                            { chrom: "chr4" },
                        ])}
                >
                    chr4
                </button>
                <button
                    @click=${() =>
                        genomeScale.zoomTo([
                            { chrom: "chr8" },
                            { chrom: "chr10" },
                        ])}
                >
                    chr8-chr10
                </button>

                <button
                    @click=${() =>
                        genomeScale.zoomTo(
                            [{ chrom: "chr1" }, { chrom: "chrM" }],
                            true
                        )}
                >
                    Whole genome (smoothly)
                </button>

                <button
                    @click=${() =>
                        genomeScale.zoomTo([400_000_000, 500_000_000])}
                >
                    [400_000_000, 500_000_000]
                </button>
            </p>
        `,
        dashboard
    );
}

const api = await embed(container, spec);

const genomeScale = api.getScaleResolutionByName("genomeScale");

updateDashboard(genomeScale);

genomeScale.addEventListener("domain", (event) =>
    updateDashboard(event.scaleResolution)
);
