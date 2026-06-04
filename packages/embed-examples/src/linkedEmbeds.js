import { embed } from "@genome-spy/core/minimal";
import { html, render } from "lit";

/**
 * @typedef {import("@genome-spy/core/spec/root.js").RootSpec} RootSpec
 * @typedef {import("@genome-spy/core/spec/genome.js").ChromosomalLocus} ChromosomalLocus
 * @typedef {import("@genome-spy/core/types/embedApi.js").EmbedResult} EmbedResult
 * @typedef {import("@genome-spy/core/types/scaleResolutionApi.js").ScaleResolutionApi} ScaleResolutionApi
 */

/** @type {RootSpec} */
const firstSpec = {
    height: 60,
    view: { stroke: "lightgray" },
    assembly: "hg38",
    data: {
        values: [
            { chrom: "chr3", pos: 134_567_890, sample: "A" },
            { chrom: "chr4", pos: 123_456_789, sample: "B" },
            { chrom: "chr7", pos: 76_543_210, sample: "C" },
            { chrom: "chr9", pos: 34_567_890, sample: "D" },
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
                zoom: true,
            },
        },
        size: { value: 180 },
        color: { field: "sample", type: "nominal" },
    },
};

/** @type {RootSpec} */
const secondSpec = {
    height: 60,
    assembly: "hg38",
    view: { stroke: "lightgray" },
    data: {
        values: [
            { chrom: "chr3", start: 120_000_000, end: 160_000_000, value: 0.4 },
            { chrom: "chr4", start: 90_000_000, end: 140_000_000, value: 0.8 },
            { chrom: "chr6", start: 30_000_000, end: 90_000_000, value: 0.2 },
            { chrom: "chr8", start: 60_000_000, end: 130_000_000, value: 0.6 },
        ],
    },
    mark: "rect",
    encoding: {
        x: {
            chrom: "chrom",
            pos: "start",
            type: "locus",
            scale: {
                name: "genomeScale",
                domain: [{ chrom: "chr3" }, { chrom: "chr9" }],
                zoom: true,
            },
        },
        x2: {
            chrom: "chrom",
            pos: "end",
        },
        color: {
            field: "value",
            type: "quantitative",
            scale: { domain: [0, 1], scheme: "blues" },
        },
    },
};

const firstContainer = document.getElementById("container-a");
const secondContainer = document.getElementById("container-b");
const dashboard = document.getElementById("dashboard");

const [firstApi, secondApi] = await Promise.all([
    embed(firstContainer, firstSpec),
    embed(secondContainer, secondSpec),
]);

/**
 * Keeps a named scale synchronized across registered GenomeSpy embeds.
 */
class LinkingManager {
    /** @type {Set<ScaleResolutionApi>} */
    #scaleResolutions = new Set();

    #scaleName;
    #syncing = false;

    /**
     * @param {string} scaleName
     */
    constructor(scaleName) {
        this.#scaleName = scaleName;
    }

    /**
     * Registers an embedded GenomeSpy instance for scale synchronization.
     * Call the returned function to stop synchronizing the instance.
     *
     * @param {EmbedResult} api
     * @returns {() => void}
     */
    register(api) {
        const scaleResolution = api.getScaleResolutionByName(this.#scaleName);
        const listener = (
            /** @type {import("@genome-spy/core/types/scaleResolutionApi.js").ScaleResolutionEvent} */ event
        ) => this.#syncFrom(event.scaleResolution);
        this.#scaleResolutions.add(scaleResolution);

        scaleResolution.addEventListener("domain", listener);

        return () => {
            scaleResolution.removeEventListener("domain", listener);
            this.#scaleResolutions.delete(scaleResolution);
        };
    }

    /**
     * @param {ScaleResolutionApi} source
     */
    #syncFrom(source) {
        if (this.#syncing) {
            return;
        }

        const domain = /** @type {ChromosomalLocus[]} */ (
            source.getComplexDomain()
        );

        this.#syncing = true;
        try {
            this.#scaleResolutions
                .values()
                .filter((scaleResolution) => scaleResolution !== source)
                .forEach(
                    (target) =>
                        void target.zoomTo(domain, { renderImmediately: true })
                );
        } finally {
            this.#syncing = false;
            updateDashboard();
        }
    }
}

const linkingManager = new LinkingManager("genomeScale");

linkingManager.register(firstApi);
linkingManager.register(secondApi);

const firstScale = firstApi.getScaleResolutionByName("genomeScale");
const secondScale = secondApi.getScaleResolutionByName("genomeScale");

updateDashboard();

function updateDashboard() {
    render(
        html`
            <p>
                Embed A domain:
                <code>${JSON.stringify(firstScale.getComplexDomain())}</code>
            </p>
            <p>
                Embed B domain:
                <code>${JSON.stringify(secondScale.getComplexDomain())}</code>
            </p>
            <p>
                Zoom to:
                <button
                    @click=${() =>
                        firstScale.zoomTo([
                            { chrom: "chr4" },
                            { chrom: "chr4" },
                        ])}
                >
                    chr4
                </button>
                <button
                    @click=${() =>
                        firstScale.zoomTo([
                            { chrom: "chr1" },
                            { chrom: "chrM" },
                        ])}
                >
                    Whole genome
                </button>
            </p>
        `,
        dashboard
    );
}
