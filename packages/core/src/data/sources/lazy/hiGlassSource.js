import DataSource from "../dataSource.js";
import { resolveUrl } from "../../../utils/url.js";
import {
    decodeTile,
    getTileWindow,
    mirrorDiagonal,
    transposeTile,
} from "./hiGlassTiles.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";

const CACHE_SIZE = 96;

/** @typedef {import("./hiGlassTiles.js").HiGlassMetadata} HiGlassMetadata */
/** @typedef {import("./singleAxisLazySource.js").DataReadinessRequest} DataReadinessRequest */

export default class HiGlassSource extends DataSource {
    /** @type {HiGlassMetadata | undefined} */
    #metadata;

    /** @type {Map<string, Float32Array>} */
    #cache = new Map();

    #metadataRequest = new AbortController();

    /** @type {{key: string, controller: AbortController} | undefined} */
    #pending;

    /** @type {string | undefined} */
    #publishedKey;

    #listening = false;
    #scheduled = false;

    /**
     * @param {import("../../../spec/data.js").HiGlassData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view);
        this.params = params;
        this.baseUrl = new URL(resolveUrl(view.getBaseUrl(), params.url));
        if (!this.baseUrl.pathname.endsWith("/")) this.baseUrl.pathname += "/";
        this.x = view.getScaleResolution("x");
        this.y = view.getScaleResolution("y");
        if (this.x?.type !== "locus" || this.y?.type !== "locus") {
            throw new Error("HiGlass needs two locus scales.");
        }
        this.registerDisposer(() => {
            this.#metadataRequest.abort();
            this.#pending?.controller.abort();
            this.#cache.clear();
        });
    }

    get label() {
        return "hiGlassSource";
    }

    activate() {
        if (this.#listening) return;
        this.#listening = true;
        const refresh = () => this.requestVisibleTiles();
        for (const scale of [this.x, this.y]) {
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
            // DataSource.load also replays the current tiles for downstream transforms.
            this.#publishedKey = undefined;
            this.requestVisibleTiles();
            return;
        }
        const signal = this.#metadataRequest.signal;
        this.setLoadingStatus("loading");
        this.reset();
        this.complete(false);
        try {
            const url = new URL("tileset_info/", this.baseUrl);
            url.searchParams.set("d", this.params.tileset);
            const response = await fetchJson(url, signal);
            signal.throwIfAborted();
            const metadata = response[this.params.tileset];
            this.#validateMetadata(metadata);
            this.#metadata = metadata;
            this.requestVisibleTiles();
        } catch (error) {
            if (!signal.aborted) this.setLoadingStatus("error", error.message);
        }
    }

    /** @param {HiGlassMetadata} metadata */
    #validateMetadata(metadata) {
        const finestStep =
            metadata?.max_width /
            (metadata?.bins_per_dimension * 2 ** metadata?.max_zoom);
        if (
            !metadata ||
            !Number.isSafeInteger(metadata.max_zoom) ||
            metadata.max_zoom < 0 ||
            !Number.isSafeInteger(metadata.bins_per_dimension) ||
            metadata.bins_per_dimension <= 0 ||
            !Number.isSafeInteger(metadata.max_width) ||
            metadata.max_width <= 0 ||
            !Number.isSafeInteger(finestStep) ||
            finestStep <= 0 ||
            !Array.isArray(metadata.chromsizes) ||
            !Array.isArray(metadata.min_pos) ||
            metadata.min_pos.length !== 2 ||
            !metadata.min_pos.every((value) => value === 0) ||
            !Array.isArray(metadata.max_pos) ||
            metadata.max_pos.length !== 2 ||
            !metadata.max_pos.every(
                (value) =>
                    Number.isFinite(value) &&
                    value > 0 &&
                    value <= metadata.max_width
            )
        ) {
            throw new Error(
                "HiGlass raster needs a square-bin, power-of-two matrix tileset."
            );
        }
        for (const scale of [this.x, this.y]) {
            const { contigs } = scale.getAssembly();
            if (
                contigs.length !== metadata.chromsizes.length ||
                contigs.some(
                    ({ name, size }, i) =>
                        name !== metadata.chromsizes[i][0] ||
                        size !== metadata.chromsizes[i][1]
                )
            ) {
                throw new Error(
                    "HiGlass chromosome order or sizes differ from the locus scale assembly."
                );
            }
        }
    }

    /** @param {DataReadinessRequest} [request] */
    #window(request) {
        const lengths = [this.x.getAxisLength(), this.y.getAxisLength()];
        if (!this.#metadata || !lengths.every((length) => length > 0)) return;
        return getTileWindow(
            this.#metadata,
            [
                request?.x ?? this.x.getDomain(),
                request?.y ?? this.y.getDomain(),
            ],
            lengths
        );
    }

    /** @param {DataReadinessRequest} request */
    isDataReadyForDomain(request) {
        const window = this.#window(request);
        return !!window && window.key === this.#publishedKey;
    }

    requestVisibleTiles() {
        if (this.#scheduled || this.disposed) return;
        this.#scheduled = true;
        queueMicrotask(() => {
            this.#scheduled = false;
            if (!this.disposed && this.view.isVisible()) void this.#refresh();
        });
    }

    async #refresh() {
        const window = this.#window();
        if (!window || this.#pending?.key === window.key) return;
        this.#pending?.controller.abort();
        this.#pending = undefined;
        if (this.#publishedKey === window.key) {
            this.setLoadingStatus("complete");
            return;
        }

        const controller = new AbortController();
        this.#pending = { key: window.key, controller };
        this.setLoadingStatus("loading");
        let publishing = false;
        try {
            const tiles = await this.#fetchTiles(window, controller.signal);
            controller.signal.throwIfAborted();
            publishing = true;
            this.reset();
            this.beginBatch({ type: "file" });
            for (const tile of tiles) this._propagate(tile);
            this.#publishedKey = window.key;
            this.complete();
            this.setLoadingStatus("complete");
        } catch (error) {
            if (publishing) this.#publishedKey = undefined;
            if (!controller.signal.aborted)
                this.setLoadingStatus("error", error.message);
        } finally {
            if (this.#pending?.controller === controller)
                this.#pending = undefined;
        }
    }

    /**
     * @param {ReturnType<typeof getTileWindow>} window
     * @param {AbortSignal} signal
     * @returns {Promise<import("../../rasterTile.js").RasterTile[]>}
     */
    async #fetchTiles({ level, width, ranges: [[x0, x1], [y0, y1]] }, signal) {
        const { bins_per_dimension: bins, mirror_tiles: mirrorTiles } =
            this.#metadata;
        const tiles = [];
        const missing = new Map();
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const mirrored = mirrorTiles !== false && x > y;
                const id = [
                    this.params.tileset,
                    level,
                    mirrored ? y : x,
                    mirrored ? x : y,
                ].join(".");
                tiles.push({ x, y, id, mirrored });
                if (!this.#cache.has(id)) missing.set(id, x === y);
            }
        }
        if (missing.size) {
            const url = new URL("tiles/", this.baseUrl);
            for (const id of missing.keys()) url.searchParams.append("d", id);
            const response = await fetchJson(url, signal);
            signal.throwIfAborted();
            for (const [id, diagonal] of missing) {
                if (!(id in response))
                    throw new Error("HiGlass omitted tile " + id);
                const values = decodeTile(response[id], bins);
                if (diagonal && mirrorTiles !== false)
                    mirrorDiagonal(values, bins);
                this.#cache.set(id, values);
            }
        }

        const step = width / bins;
        const result = tiles.map(({ x, y, id, mirrored }) => {
            const values = this.#cache.get(id);
            this.#cache.delete(id);
            this.#cache.set(id, values);
            return {
                dimensions: {
                    column: { origin: x * width, step, count: bins },
                    row: { origin: y * width, step, count: bins },
                },
                fields: {
                    value: mirrored ? transposeTile(values, bins) : values,
                },
            };
        });
        while (this.#cache.size > CACHE_SIZE)
            this.#cache.delete(this.#cache.keys().next().value);
        return result;
    }
}

/** @param {URL} url @param {AbortSignal} signal */
async function fetchJson(url, signal) {
    const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    });
    if (!response.ok)
        throw new Error(`HiGlass returned HTTP ${response.status} for ${url}.`);
    return response.json();
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").HiGlassData}
 */
function isHiGlassSource(params) {
    return params?.type === "higlass";
}

registerBuiltInLazyDataSource(isHiGlassSource, HiGlassSource);
