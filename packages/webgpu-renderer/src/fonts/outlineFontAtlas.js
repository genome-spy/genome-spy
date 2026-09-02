import { MsdfAtlasTexture } from "../symbols/msdfAtlasTexture.js";
import { getMsdfAtlasGenerator } from "../symbols/sparseGpuPathAtlas.js";
import { gpuLabel } from "../utils/gpuLabel.js";
import { OUTLINE_ATLAS_OPTIONS } from "./outlineTextLayout.js";

const INITIAL_ATLAS_WIDTH = 256;
const INITIAL_ATLAS_HEIGHT = 128;
const MAX_GLYPHS_PER_BATCH = 32;

/**
 * @typedef {object} OutlineAtlasEntry
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * Renderer-owned, append-only atlas for one exact outline-font object.
 *
 * Missing glyphs are generated as tightly packed temporary batches. Their
 * slots are copied into stable shelf allocations in the final texture. Atlas
 * growth copies existing texels without changing any entry coordinates.
 */
export class OutlineFontAtlas {
    /**
     * @param {import("../renderer.js").Renderer} renderer
     * @param {import("./trueTypeFont.js").TrueTypeFont} font
     */
    constructor(renderer, font) {
        this.renderer = renderer;
        this.device = renderer.device;
        this.font = font;
        this.generator = getMsdfAtlasGenerator(renderer);
        this.storage = new MsdfAtlasTexture(this.device, {
            width: INITIAL_ATLAS_WIDTH,
            height: INITIAL_ATLAS_HEIGHT,
            label: "outline font atlas",
        });
        this.sampler = this.device.createSampler({
            label: "outline font atlas sampler",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "linear",
            minFilter: "linear",
        });
        /** @type {Map<string, OutlineAtlasEntry>} */
        this._entryByPath = new Map();
        this._shelfX = 0;
        this._shelfY = 0;
        this._shelfHeight = 0;
        this._destroyed = false;
        /** @type {Set<Promise<void>>} */
        this._pendingBatches = new Set();
    }

    get texture() {
        return this.storage.texture;
    }

    get width() {
        return this.storage.width;
    }

    get height() {
        return this.storage.height;
    }

    get version() {
        return this.storage.version;
    }

    /**
     * @param {(atlas: OutlineFontAtlas) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
        return this.storage.subscribe(() => listener(this));
    }

    /**
     * Ensure all paths have stable final-atlas entries.
     *
     * @param {string[]} paths
     * @returns {OutlineAtlasEntry[]}
     */
    ensure(paths) {
        if (this._destroyed) {
            throw new Error("Outline font atlas has been destroyed.");
        }
        const missing = Array.from(
            new Set(paths.filter((path) => !this._entryByPath.has(path)))
        );
        for (
            let offset = 0;
            offset < missing.length;
            offset += MAX_GLYPHS_PER_BATCH
        ) {
            this._appendBatch(
                missing.slice(offset, offset + MAX_GLYPHS_PER_BATCH)
            );
        }
        return paths.map(
            (path) =>
                /** @type {OutlineAtlasEntry} */ (this._entryByPath.get(path))
        );
    }

    /** @param {string[]} paths */
    _appendBatch(paths) {
        const batch = this.generator.createAtlas(
            paths,
            {
                ...OUTLINE_ATLAS_OPTIONS,
                normalizationSpan: this.font.unitsPerEm,
                format: "rgba16float",
            },
            "outline glyph batch"
        );
        batch.completion.catch(() => {});
        const placements = this._allocateBatch(batch.jobs);
        const encoder = this.device.createCommandEncoder({
            label: gpuLabel("outline font atlas", "batch copy"),
        });

        for (let index = 0; index < paths.length; index++) {
            const job = batch.jobs[index];
            const placement = placements[index];
            encoder.copyTextureToTexture(
                {
                    texture: batch.texture,
                    origin: [job.slotX, job.slotY, 0],
                },
                {
                    texture: this.texture,
                    origin: [placement.x, placement.y, 0],
                },
                [job.slotWidth, job.slotHeight, 1]
            );
            this._entryByPath.set(paths[index], {
                x: placement.x + job.gutter + 0.5,
                y: placement.y + job.gutter + 0.5,
                width: job.tileWidth - 1,
                height: job.tileHeight - 1,
            });
        }

        this.device.queue.submit([encoder.finish()]);
        const completion = this.device.queue.onSubmittedWorkDone().then(
            () => batch.destroy(),
            () => batch.destroy()
        );
        this._pendingBatches.add(completion);
        void completion.finally(() => this._pendingBatches.delete(completion));
    }

    /**
     * @param {{ slotWidth: number, slotHeight: number }[]} jobs
     * @returns {{ x: number, y: number }[]}
     */
    _allocateBatch(jobs) {
        let requiredWidth = this.width;
        for (const job of jobs) {
            while (requiredWidth < job.slotWidth) {
                requiredWidth *= 2;
            }
        }

        let x = this._shelfX;
        let y = this._shelfY;
        let shelfHeight = this._shelfHeight;
        const placements = jobs.map((job) => {
            if (x > 0 && x + job.slotWidth > requiredWidth) {
                x = 0;
                y += shelfHeight;
                shelfHeight = 0;
            }
            const placement = { x, y };
            x += job.slotWidth;
            shelfHeight = Math.max(shelfHeight, job.slotHeight);
            return placement;
        });
        const requiredHeight = y + shelfHeight;
        this.storage.grow(requiredWidth, requiredHeight);
        this._shelfX = x;
        this._shelfY = y;
        this._shelfHeight = shelfHeight;
        return placements;
    }

    destroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        this._entryByPath.clear();
        this.storage.destroy();
    }
}

/** @type {WeakMap<import("../renderer.js").Renderer, WeakMap<import("./trueTypeFont.js").TrueTypeFont, OutlineFontAtlas>>} */
const atlasesByRenderer = new WeakMap();

/**
 * @param {import("../renderer.js").Renderer} renderer
 * @param {import("./trueTypeFont.js").TrueTypeFont} font
 */
export function getOutlineFontAtlas(renderer, font) {
    let atlases = atlasesByRenderer.get(renderer);
    if (!atlases) {
        atlases = new WeakMap();
        atlasesByRenderer.set(renderer, atlases);
    }
    let atlas = atlases.get(font);
    if (!atlas) {
        atlas = renderer._ownResource(new OutlineFontAtlas(renderer, font));
        atlases.set(font, atlas);
    }
    return atlas;
}
