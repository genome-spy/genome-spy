import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import {
    createDescriptorFieldAttacher,
    getUrlDescriptorExpressions,
} from "../urlDescriptor.js";
import IntervalUrlSource from "./intervalUrlSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";

/**
 * @typedef {object} FigWigHandle
 * @prop {import("@genome-spy/figwig").FigWig} reader
 * @prop {Map<string, number>} chromosomeLengths
 * @prop {(datum: Record<string, any>) => Record<string, any>} attachFields
 */

/** @extends {IntervalUrlSource<FigWigHandle, import("../../flowNode.js").Datum[][]>} */
export default class FigWigSource extends IntervalUrlSource {
    #requestedBinSize = 0;

    #publishedBinSize = 0;

    /**
     * @param {import("../../../spec/data.js").FigWigData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        const paramsWithDefaults = {
            pixelsPerBin: 2,
            channel: /** @type {const} */ ("x"),
            debounce: 200,
            debounceMode: /** @type {const} */ ("window"),
            ...params,
        };
        super(view, paramsWithDefaults.channel);

        this.params = activateExprRefProps(
            view.paramRuntime,
            paramsWithDefaults,
            (props) => {
                if (props.has("url")) {
                    this.reloadUrlDescriptors();
                } else if (props.has("tracks") || props.has("pixelsPerBin")) {
                    this.invalidateData();
                    this.reloadLastDomain();
                }
            },
            (disposer) => this.registerDisposer(disposer),
            getUrlDescriptorExpressions(paramsWithDefaults.url)
        );

        if (!this.params.url) {
            throw new Error("No URL provided for FigWigSource");
        }

        this.setupUrlLoading({
            singleUrl: true,
            loadModules: loadFigWigModules,
            createHandle: async (descriptor, { FigWig, RemoteFile }) => {
                const reader = new FigWig({
                    filehandle: new RemoteFile(descriptor.url),
                });
                const header = await reader.getHeader();
                return {
                    reader,
                    chromosomeLengths: new Map(
                        header.chromosomes.map((c) => [c.name, c.length])
                    ),
                    attachFields: createDescriptorFieldAttacher(
                        descriptor.fields
                    ),
                };
            },
        });
    }

    get label() {
        return "figWigSource";
    }

    /** @param {number[]} domain */
    onDomainChanged(domain) {
        this.queueDomain(domain);
    }

    /**
     * @param {number[]} domain
     * @param {FigWigHandle[]} handles
     * @param {AbortSignal} signal
     */
    async loadWindow(domain, [handle], signal) {
        const pixelsPerBin = withoutExprRef(this.params.pixelsPerBin);
        if (!Number.isFinite(pixelsPerBin) || pixelsPerBin <= 0) {
            throw new Error("Figwig pixelsPerBin must be a positive number.");
        }
        const tracks = withoutExprRef(this.params.tracks);
        if (
            tracks !== undefined &&
            (!Array.isArray(tracks) ||
                tracks.some((track) => typeof track !== "string"))
        ) {
            throw new Error("Figwig tracks must be an array of track names.");
        }

        const length = this.scaleResolution.getAxisLength() || 700;
        const binSize = Math.max(
            1,
            Math.ceil(((domain[1] - domain[0]) / length) * pixelsPerBin)
        );
        // Keep small-pan coverage without decoding wide, potentially dense gaps.
        // Cap each side's quantization padding at one eighth of the viewport.
        const windowSize = Math.max(
            1,
            Math.min(binSize * 32, Math.floor((domain[1] - domain[0]) / 8))
        );
        this.#requestedBinSize = binSize;
        const interval = this.getChangedWindow(
            domain,
            windowSize,
            binSize !== this.#publishedBinSize
        );
        if (!interval) return;

        return {
            interval,
            windowSize,
            data:
                tracks?.length === 0
                    ? []
                    : await this.discretizeAndLoad(
                          interval,
                          {
                              load: async (d, signal) =>
                                  (
                                      await this.#loadBins(
                                          [d],
                                          handle,
                                          tracks,
                                          binSize,
                                          signal
                                      )
                                  )[0],
                              loadBatch: (ds, signal) =>
                                  this.#loadBins(
                                      ds,
                                      handle,
                                      tracks,
                                      binSize,
                                      signal
                                  ),
                          },
                          signal
                      ),
        };
    }

    /**
     * @param {import("../../flowNode.js").Datum[][]} data
     * @param {number[]} interval
     * @param {FigWigHandle[]} handles
     */
    publishInterval(data, interval, handles) {
        // The base guards publication with the active request's abort signal.
        // Failed or obsolete resolution changes must not advance this key.
        const binSize = this.#requestedBinSize;
        super.publishInterval(data, interval, handles);
        this.#publishedBinSize = binSize;
    }

    /**
     * @param {import("../../../genome/genome.js").DiscreteChromosomeInterval[]} intervals
     * @param {FigWigHandle} handle
     * @param {string[] | undefined} tracks
     * @param {number} binSize
     * @param {AbortSignal} signal
     */
    async #loadBins(intervals, handle, tracks, binSize, signal) {
        const regions = intervals.map((d) => ({
            chromosome: d.chrom,
            start: d.startPos,
            end: Math.min(d.endPos, handle.chromosomeLengths.get(d.chrom) ?? 0),
        }));
        const batches = await handle.reader.getBinsMulti(
            regions.filter((r) => r.end > r.start),
            {
                tracks,
                binSize,
                aggregation: "mean",
                missing: "omit",
                useSummaries: false,
                signal,
            }
        );

        let batchIndex = 0;
        return regions.map((region) => {
            /** @type {import("../../flowNode.js").Datum[]} */
            const data = [];
            if (region.end <= region.start) return data;

            const batch = batches[batchIndex++];
            for (const { track, values } of batch.tracks) {
                for (let i = 0; i < values.length; i++) {
                    const score = values[i];
                    if (Number.isFinite(score)) {
                        data.push(
                            handle.attachFields({
                                chrom: region.chromosome,
                                start: batch.starts[i],
                                end: batch.ends[i],
                                score,
                                sampleId: track.name,
                            })
                        );
                    }
                }
            }
            return data;
        });
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").FigWigData}
 */
function isFigWigSource(params) {
    return params?.type === "figwig";
}

registerBuiltInLazyDataSource(isFigWigSource, FigWigSource);

async function loadFigWigModules() {
    const [{ FigWig }, { RemoteFile }] = await Promise.all([
        import("@genome-spy/figwig"),
        import("generic-filehandle2"),
    ]);
    return { FigWig, RemoteFile };
}
