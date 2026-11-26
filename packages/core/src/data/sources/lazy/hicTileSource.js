import { HicFile } from "@gmod/hic";
import { RemoteFileWithRangeCache } from "@gmod/range-cache-filehandle";
import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import { debounce } from "../../../utils/debounce.js";
import { resolveUrl } from "../../../utils/url.js";
import { getResolvedTriangleDirection } from "../../../view/triangleProjection.js";
import DataSource from "../dataSource.js";
import { matchHicContigs, packHicTile, planHicWindow } from "./hicTiles.js";

/** @typedef {import("./hicTiles.js").HicRasterTile} HicRasterTile */
/** @typedef {import("./singleAxisLazySource.js").DataReadinessRequest} DataReadinessRequest */

const MiB = 1024 ** 2;

export default class HicTileSource extends DataSource {
    #reader;

    /** @type {{contigs: ReturnType<typeof matchHicContigs>, resolutions: number[]} | undefined} */
    #metadata;

    /** @type {Promise<void> | undefined} */
    #opening;

    /** @type {Map<string, HicRasterTile | null>} */
    #cache = new Map();

    #cacheBytes = 0;

    #cacheLimit;

    #lifetime = new AbortController();

    /** @type {{key: string, controller: AbortController} | undefined} */
    #pending;

    /** @type {string | undefined} */
    #publishedKey;

    #listening = false;
    #refreshOnFrame = () => {
        void this.#refresh(true);
    };
    #scheduleFetch = debounce(
        () => this.#refresh(),
        () => withoutExprRef(this.params.debounce),
        false
    );

    /**
     * @param {import("../../../spec/data.js").HicData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view);
        const x = view.getScaleResolution("x");
        const triangle = getResolvedTriangleDirection(view);
        const y = triangle ? undefined : view.getScaleResolution("y");
        this.scales = y ? [x, y] : [x];
        if (x?.type !== "locus" || (!triangle && y?.type !== "locus")) {
            throw new Error(
                "A .hic source requires locus scales for the contact map."
            );
        }

        this.params = activateExprRefProps(
            this.paramRuntime,
            {
                debounce: params.debounce ?? 200,
                normalization: params.normalization ?? "NONE",
            },
            (changed) => {
                if (changed.has("normalization")) {
                    // Update readiness before callers await the new selection.
                    this.#scheduleFetch.cancel();
                    void this.#refresh();
                }
            },
            (dispose) => this.registerDisposer(dispose)
        );
        this.#cacheLimit = (params.cacheSizeMiB ?? 32) * MiB;
        if (!Number.isFinite(this.#cacheLimit) || this.#cacheLimit < 0) {
            throw new Error(
                ".hic cacheSizeMiB must be finite and nonnegative."
            );
        }
        this.#reader = new HicFile({
            filehandle: new RemoteFileWithRangeCache(
                resolveUrl(view.getBaseUrl(), params.url)
            ),
            blockCacheMaxBytes: 32 * MiB,
        });
        this.registerDisposer(() => {
            view.context.animator.cancelTransition(this.#refreshOnFrame);
            this.#scheduleFetch.cancel();
            this.#lifetime.abort();
            this.#pending?.controller.abort();
            this.#reader.clearCache();
            this.#cache.clear();
        });
    }

    get label() {
        return "hicSource";
    }

    get isRemoteLazy() {
        return true;
    }

    activate() {
        if (this.#listening) return;
        this.#listening = true;
        const refresh = () => this.ensureViewportData();
        for (const scale of this.scales) {
            scale.addEventListener("domain", refresh);
            this.registerDisposer(() =>
                scale.removeEventListener("domain", refresh)
            );
        }
        this.view.context.addBroadcastListener("layoutComputed", refresh);
        this.registerDisposer(() =>
            this.view.context.removeBroadcastListener("layoutComputed", refresh)
        );
    }

    async load() {
        if (this.#metadata) {
            this.#publishedKey = undefined;
            this.ensureViewportData();
            return;
        }
        return (this.#opening ??= this.#open().finally(() => {
            this.#opening = undefined;
        }));
    }

    async #open() {
        this.setLoadingStatus("loading");
        this.reset();
        this.complete(false);
        const signal = AbortSignal.any([
            this.#lifetime.signal,
            AbortSignal.timeout(30_000),
        ]);
        try {
            const { chromosomes, resolutions } = await this.#reader.getMetaData(
                { signal }
            );
            signal.throwIfAborted();
            const [x, y] = this.scales;
            const { contigs } = x.getAssembly();
            if (y) {
                const other = y.getAssembly().contigs;
                if (
                    contigs.length !== other.length ||
                    contigs.some(
                        ({ name, size }, i) =>
                            name !== other[i].name || size !== other[i].size
                    )
                ) {
                    throw new Error(
                        "The .hic x and y scales must use the same ordered assembly."
                    );
                }
            }
            const levels = resolutions
                .filter((r) => Number.isSafeInteger(r) && r > 0)
                .sort((a, b) => a - b);
            if (!levels.length)
                throw new Error("The .hic file has no base-pair resolutions.");
            this.#metadata = {
                contigs: matchHicContigs(contigs, chromosomes),
                resolutions: levels,
            };
            void this.#refresh();
        } catch (error) {
            if (!this.disposed) this.setLoadingStatus("error", error.message);
        }
    }

    /** @param {DataReadinessRequest} [request] */
    #window(request) {
        const plot = this.view.getPlotSize();
        if (!this.#metadata || !(plot?.width > 0 && plot.height > 0)) return;
        const [x, y] = this.scales;
        const window = planHicWindow(
            this.#metadata.contigs,
            this.#metadata.resolutions,
            plot,
            request?.x ?? x.getDomain(),
            y && (request?.y ?? y.getDomain())
        );
        if (!window) return null;
        const normalization = withoutExprRef(this.params.normalization);
        return {
            ...window,
            normalization,
            key: `${normalization}:${window.key}`,
        };
    }

    /** @param {DataReadinessRequest} [request] */
    isDataReadyForDomain(request) {
        const window = this.#window(request);
        return !!window && window.key === this.#publishedKey;
    }

    /** @param {DataReadinessRequest} [request] */
    isViewportReady(request) {
        return this.isDataReadyForDomain(request);
    }

    ensureViewportData() {
        if (this.#metadata && !this.disposed) {
            this.#scheduleFetch.cancel();
            this.view.context.animator.requestTransition(this.#refreshOnFrame);
        }
    }

    async #refresh(deferFetch = false) {
        if (this.disposed || !this.view.isVisible()) return;
        const window = this.#window();
        if (
            window === undefined ||
            (window && this.#pending?.key === window.key)
        )
            return;

        this.#pending?.controller.abort();
        this.#pending = undefined;
        if (!window) {
            this.setLoadingStatus(
                "error",
                "The .hic window exceeds the tile budget at the coarsest resolution. Zoom in to load contacts."
            );
            return;
        }
        if (this.#publishedKey === window.key) {
            this.setLoadingStatus("complete");
            return;
        }

        const cacheKeys = window.tiles.map(
            ({ key }) => `${window.normalization}:${key}`
        );
        const tiles = cacheKeys.map((key) => this.#cache.get(key));
        const misses = Array.from(tiles.keys()).filter(
            (i) => tiles[i] === undefined
        );
        if (deferFetch && misses.length) {
            void this.#scheduleFetch();
            return;
        }

        const controller = new AbortController();
        const pending = { key: window.key, controller };
        this.#pending = pending;
        const signal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(60_000),
        ]);
        try {
            if (misses.length) this.setLoadingStatus("loading");
            // The filehandle coalesces overlapping reads across tile queries.
            for (let i = 0; i < misses.length; i += 4) {
                await Promise.all(
                    misses.slice(i, i + 4).map(async (index) => {
                        tiles[index] = await this.#readTile(
                            window.tiles[index],
                            window.binSize,
                            window.normalization,
                            signal
                        );
                    })
                );
            }
            signal.throwIfAborted();
            if (this.#window()?.key !== window.key) return;

            this.#publishedKey = undefined;
            this.reset();
            this.beginBatch({ type: "file" });
            for (const [i, tile] of tiles.entries()) {
                if (this.#cacheLimit) this.#retain(cacheKeys[i], tile);
                if (tile) this._propagate(tile);
            }
            this.#publishedKey = window.key;
            this.complete();
            this.setLoadingStatus("complete");
        } catch (error) {
            if (
                !controller.signal.aborted &&
                this.#window()?.key === window.key
            ) {
                this.#publishedKey = undefined;
                this.setLoadingStatus("error", error.message);
            }
            controller.abort();
        } finally {
            if (this.#pending === pending) this.#pending = undefined;
        }
    }

    /**
     * @param {import("./hicTiles.js").HicTileLocation} tile
     * @param {number} binSize
     * @param {string} normalization
     * @param {AbortSignal} signal
     */
    async #readTile(tile, binSize, normalization, signal) {
        const { column, row } = tile;
        const matrix = await this.#reader.getMatrix(column.index, row.index, {
            signal,
        });
        if (!matrix) return null;
        if (!matrix.getZoomData(binSize)) {
            const levels = matrix
                .getZoomLevels()
                .map(({ zoom }) => zoom.binSize);
            const detail = levels.length
                ? `Available bin sizes are ${levels.join(", ")} bp.`
                : "This pair has no base-pair resolutions.";
            throw new Error(
                `No ${binSize} bp .hic matrix is stored for ${column.region.chr}/${row.region.chr}. ${detail}`
            );
        }

        const { records, appliedNormalization } =
            await this.#reader.getContactRecords(
                normalization,
                column.region,
                row.region,
                binSize,
                { signal, bothOrientations: true }
            );
        if (appliedNormalization !== normalization) {
            throw new Error(
                `.hic normalization "${normalization}" is unavailable for ${column.region.chr}/${row.region.chr} at ${binSize} bp.`
            );
        }

        // The reader omits masked contacts. Keep those bins distinct from valid zeros.
        const weights =
            normalization === "NONE"
                ? undefined
                : await Promise.all(
                      [column, row].map(async ({ region, dimension }) => {
                          const vector =
                              await this.#reader.getNormalizationVector(
                                  normalization,
                                  region.chr,
                                  binSize,
                                  { signal }
                              );
                          const start = region.start / binSize;
                          return vector.getValues(
                              start,
                              start + dimension.count,
                              { signal }
                          );
                      })
                  );
        return packHicTile(tile, binSize, records, weights);
    }

    /**
     * @param {string} key
     * @param {HicRasterTile | null} tile
     */
    #retain(key, tile) {
        // Charge each entry for its raster and key, including absent matrices.
        const bytes = (/** @type {HicRasterTile | null} */ tile) =>
            (tile?.fields.value.byteLength ?? 0) + 128;
        if (!this.#cache.delete(key)) this.#cacheBytes += bytes(tile);
        this.#cache.set(key, tile);
        while (this.#cacheBytes > this.#cacheLimit) {
            const oldest = this.#cache.keys().next().value;
            this.#cacheBytes -= bytes(this.#cache.get(oldest));
            this.#cache.delete(oldest);
        }
    }
}
