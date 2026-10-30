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
 * @prop {number} tileSize
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
            mode: /** @type {const} */ ("exact"),
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
                } else if (
                    props.has("tracks") ||
                    props.has("pixelsPerBin") ||
                    props.has("mode")
                ) {
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
                try {
                    const header = await reader.getHeader();
                    return {
                        reader,
                        tileSize: header.tileSize,
                        chromosomeLengths: new Map(
                            header.chromosomes.map((c) => [c.name, c.length])
                        ),
                        attachFields: createDescriptorFieldAttacher(
                            descriptor.fields
                        ),
                    };
                } catch (error) {
                    await reader.close();
                    throw error;
                }
            },
            disposeHandle: (handle) => handle.reader.close(),
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
        const mode = withoutExprRef(this.params.mode);
        if (mode !== "exact" && mode !== "fast") {
            throw new Error('Figwig mode must be "exact" or "fast".');
        }

        const length = this.scaleResolution.getAxisLength() || 700;
        const desiredBinSize = Math.max(
            1,
            Math.ceil(((domain[1] - domain[0]) / length) * pixelsPerBin)
        );
        const useSummaries =
            mode === "fast" && desiredBinSize >= handle.tileSize;
        const binSize = useSummaries
            ? handle.tileSize *
              2 ** Math.ceil(Math.log2(desiredBinSize / handle.tileSize))
            : desiredBinSize;
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
                                          useSummaries,
                                          signal
                                      )
                                  )[0],
                              loadBatch: (ds, signal) =>
                                  this.#loadBins(
                                      ds,
                                      handle,
                                      tracks,
                                      binSize,
                                      useSummaries,
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
     * @param {boolean} useSummaries
     * @param {AbortSignal} signal
     */
    async #loadBins(intervals, handle, tracks, binSize, useSummaries, signal) {
        const { reader, chromosomeLengths } = handle;
        const regions = intervals.map((d) => {
            const length = chromosomeLengths.get(d.chrom) ?? 0;
            const end = Math.min(d.endPos, length);
            // Alignment must not pull an entirely out-of-file request into data.
            const align = useSummaries && end > d.startPos;
            return {
                chromosome: d.chrom,
                start: align
                    ? Math.floor(d.startPos / binSize) * binSize
                    : d.startPos,
                end: align
                    ? Math.min(Math.ceil(end / binSize) * binSize, length)
                    : end,
            };
        });
        const requestedRegions = regions.filter((r) => r.end > r.start);
        if (useSummaries && requestedRegions.length) {
            const selected = tracks
                ? await reader.selectTracks(tracks, { signal })
                : await reader.getTracks({ signal });
            const groups = Array.from(new Set(selected.map((t) => t.group)));
            const levels = await reader.getZoomLevels({ tracks, signal });

            // The published reader falls back to raw values. Check the summaries
            // it would select first, preserving fast mode's bounded coarse reads.
            await Promise.all(
                requestedRegions.flatMap((region) =>
                    groups.map(async (group) => {
                        const level = levels.findLast(
                            (level) =>
                                level.groups.includes(group) &&
                                region.start % level.binSize === 0 &&
                                binSize % level.binSize === 0 &&
                                (region.end % level.binSize === 0 ||
                                    region.end ===
                                        chromosomeLengths.get(
                                            region.chromosome
                                        ))
                        );
                        const summary = await reader.getSummary(
                            group,
                            level?.level ?? 0,
                            { signal }
                        );
                        if (!summary.available) {
                            throw new Error("Required summaries unavailable");
                        }
                    })
                )
            );
        }

        const batches = await reader.getBinsMulti(requestedRegions, {
            tracks,
            binSize,
            aggregation: "mean",
            missing: useSummaries ? "zero" : "omit",
            useSummaries,
            signal,
        });

        let batchIndex = 0;
        return regions.map((region, intervalIndex) => {
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
                                // Fast means describe aligned summary bins; keep
                                // their approximations inside requested bounds.
                                start: Math.max(
                                    batch.starts[i],
                                    intervals[intervalIndex].startPos
                                ),
                                end: Math.min(
                                    batch.ends[i],
                                    intervals[intervalIndex].endPos
                                ),
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
