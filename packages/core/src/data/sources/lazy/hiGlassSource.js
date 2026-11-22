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
        this.scales = [view.getScaleResolution("x")];
        if (params.projection !== "triangle")
            this.scales.push(view.getScaleResolution("y"));
        if (this.scales.some((scale) => scale?.type !== "locus")) {
            throw new Error("HiGlass needs a locus scale on each matrix axis.");
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
            // DataSource.load also replays the current tiles for downstream transforms.
            this.#publishedKey = undefined;
            this.ensureViewportData();
            return;
        }
        const signal = this.#metadataRequest.signal;
        this.setLoadingStatus("loading");
        this.reset();
        this.complete(false);
        try {
            const response = await this.#fetch(
                "tileset_info/",
                [this.params.tileset],
                signal
            );
            signal.throwIfAborted();
            const metadata = response[this.params.tileset];
            this.#validateMetadata(metadata);
            this.#metadata = metadata;
            this.ensureViewportData();
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
        for (const scale of this.scales) {
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
        if (!this.#metadata) return;
        const [x, y] = this.scales;
        const xDomain = request?.x ?? x.getDomain();
        if (!y) {
            const coords = this.view.layoutCoords;
            if (!(coords?.width > 0 && coords.height > 0)) return;
            return getTileWindow(
                this.#metadata,
                [xDomain],
                [coords.width],
                coords.height
            );
        }
        const lengths = [x.getAxisLength(), y.getAxisLength()];
        if (!lengths.every((length) => length > 0)) return;
        return getTileWindow(
            this.#metadata,
            [xDomain, request?.y ?? y.getDomain()],
            lengths
        );
    }

    /** @param {DataReadinessRequest} request */
    isDataReadyForDomain(request) {
        const window = this.#window(request);
        return !!window && window.key === this.#publishedKey;
    }

    /** @param {DataReadinessRequest} [request] */
    isViewportReady(request) {
        return this.isDataReadyForDomain(request);
    }

    ensureViewportData() {
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
        try {
            const tiles = await this.#fetchTiles(window, controller.signal);
            controller.signal.throwIfAborted();
            this.#publishedKey = undefined;
            this.reset();
            this.beginBatch({ type: "file" });
            for (const tile of tiles) this._propagate(tile);
            this.#publishedKey = window.key;
            this.complete();
            this.setLoadingStatus("complete");
        } catch (error) {
            if (controller.signal.aborted) return;
            if (this.#publishedKey === window.key)
                this.#publishedKey = undefined;
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
    async #fetchTiles({ level, width, rows }, signal) {
        const { bins_per_dimension: bins, mirror_tiles: mirrorTiles } =
            this.#metadata;
        const tiles = [];
        const missing = new Set();
        for (const [y, start, end] of rows) {
            for (let x = start; x < end; x++) {
                const mirrored = mirrorTiles !== false && x > y;
                const id = [
                    this.params.tileset,
                    level,
                    mirrored ? y : x,
                    mirrored ? x : y,
                ].join(".");
                tiles.push({ x, y, id, mirrored });
                if (!this.#cache.has(id)) missing.add(id);
            }
        }
        const response = missing.size
            ? await this.#fetch("tiles/", missing, signal)
            : {};
        signal.throwIfAborted();

        const step = width / bins;
        const result = tiles.map(({ x, y, id, mirrored }) => {
            let values = this.#cache.get(id);
            if (values) {
                this.#cache.delete(id);
            } else {
                if (!(id in response))
                    throw new Error("HiGlass omitted tile " + id);
                values = decodeTile(response[id], bins);
                if (x === y && mirrorTiles !== false)
                    mirrorDiagonal(values, bins);
            }
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

    /** @param {string} path @param {Iterable<string>} ids @param {AbortSignal} signal */
    async #fetch(path, ids, signal) {
        const url = new URL(path, this.baseUrl);
        for (const id of ids) url.searchParams.append("d", id);
        const response = await fetch(url, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        });
        if (!response.ok)
            throw new Error(
                `HiGlass returned HTTP ${response.status} for ${url}.`
            );
        return response.json();
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").HiGlassData}
 */
function isHiGlassSource(params) {
    return params?.type === "higlass";
}

registerBuiltInLazyDataSource(isHiGlassSource, HiGlassSource);
