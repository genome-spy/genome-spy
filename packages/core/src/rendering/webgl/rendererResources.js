import {
    groupingGapKey,
    hasGroupingGaps,
} from "../../genome/indexGapMapping.js";
import { createTexture } from "twgl.js";
import { isDiscrete } from "vega-scale";
import {
    findChannelDefWithScale,
    isChannelWithScale,
} from "../../encoder/encoder.js";

import WebGLArrowMark from "./marks/arrow.js";
import WebGLLinkMark from "./marks/link.js";
import WebGLPointMark from "./marks/point.js";
import WebGLRectMark from "./marks/rect.js";
import WebGLRuleMark from "./marks/rule.js";
import WebGLTextMark from "./marks/text.js";
import { getWebGlTextFont } from "./textFont.js";

const markTypes = {
    point: WebGLPointMark,
    rect: WebGLRectMark,
    arrow: WebGLArrowMark,
    rule: WebGLRuleMark,
    tick: WebGLRuleMark,
    link: WebGLLinkMark,
    text: WebGLTextMark,
};

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("./gl/webGLHelper.js").default} glHelper
 * @param {WebGLRendererResources} [rendererResources]
 * @returns {import("./types.js").WebGLMark}
 */
export function createWebGLMark(mark, glHelper, rendererResources) {
    const Mark = markTypes[mark.getType()];
    if (!Mark) {
        throw new Error("Unsupported WebGL mark type: " + mark.getType());
    }
    return new Mark(mark, glHelper, rendererResources);
}

/**
 * @typedef {object} WebGLMarkEntry
 * @prop {import("../../marks/mark.js").default} mark
 * @prop {import("./types.js").WebGLMark} graphics
 * @prop {"compiling" | "ready" | "failed" | "disposed"} state
 * @prop {import("../../data/collector.js").default | undefined} collector
 * @prop {number} dataRevision
 * @prop {number} configurationRevision
 * @prop {number} gapKey
 * @prop {number} encodedDataRevision
 * @prop {Set<import("../../scales/scaleResolution.js").default>} scaleResolutions
 */

export default class WebGLRendererResources {
    #disposed = false;

    /** @type {Map<import("../../marks/mark.js").default, WebGLMarkEntry>} */
    #markEntries = new Map();

    /** @type {Map<import("../../scales/scaleResolution.js").default, {count: number, dispose: () => void}>} */
    #scaleResolutionRefs = new Map();

    /** @type {Map<string, {texture: WebGLTexture, ready: Promise<void>}>} */
    #fontTextures = new Map();

    /** @type {Map<import("../../scales/scaleResolution.js").default, {cuts: readonly number[], texture: WebGLTexture}>} */
    #gapTextures = new Map();

    /** @type {Map<import("../../scales/scaleResolution.js").default, WebGLTexture>} */
    #categoricalTextures = new Map();

    /** @param {import("../../scales/scaleResolution.js").default} resolution */
    getCategoricalTexture(resolution) {
        return this.#categoricalTextures.get(resolution);
    }

    /** Stable Core IDs address dense active slots; zero denotes nonmembership.
     * @param {import("../../scales/scaleResolution.js").default} resolution
     */
    #updateCategoricalTexture(resolution) {
        const scale = resolution.getScale();
        const previous = this.#categoricalTextures.get(resolution);
        if (!isDiscrete(scale.type)) {
            if (previous) this.glHelper.gl.deleteTexture(previous);
            this.#categoricalTextures.delete(resolution);
            return;
        }
        const indexer =
            /** @type {ReturnType<import("../../utils/indexer.js").default>} */ (
                /** @type {any} */ (scale.props).domainIndexer
            );
        const ids = scale.domain().map((value) => indexer(value));
        const count = ids.reduce((max, id) => Math.max(max, id + 1), 1);
        const gl = this.glHelper.gl;
        const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const width = Math.min(count, maxSize);
        const height = Math.ceil(count / width);
        if (height > maxSize)
            throw new Error(
                "Too many categorical IDs for a WebGL domain texture."
            );
        const data = new Uint32Array(width * height);
        ids.forEach((id, slot) => {
            data[id] = slot + 1;
        });

        const texture = previous ?? gl.createTexture();
        this.#uploadIntegerTexture(
            texture,
            data,
            width,
            height,
            gl.R32UI,
            gl.RED_INTEGER
        );
        this.#categoricalTextures.set(resolution, texture);
    }

    /** @param {import("../../scales/scaleResolution.js").default} resolution */
    getGapTexture(resolution) {
        const cuts =
            /** @type {import("../../genome/scaleIndex.js").ScaleIndex} */ (
                resolution.getScale()
            ).gapPositions();
        const previous = this.#gapTextures.get(resolution);
        if (previous?.cuts === cuts) return previous.texture;
        const gl = this.glHelper.gl;
        const width = Math.min(
            Math.max(1, cuts.length),
            gl.getParameter(gl.MAX_TEXTURE_SIZE)
        );
        const height = Math.max(1, Math.ceil(cuts.length / width));
        if (height > gl.getParameter(gl.MAX_TEXTURE_SIZE))
            throw new Error("Too many grouping gaps for a WebGL cut texture.");
        const data = new Uint32Array(width * height * 2);
        for (let i = 0; i < cuts.length; i++) {
            data[2 * i] = Math.floor(cuts[i] / 4096);
            data[2 * i + 1] = cuts[i] % 4096;
        }
        const texture = previous?.texture ?? gl.createTexture();
        this.#uploadIntegerTexture(
            texture,
            data,
            width,
            height,
            gl.RG32UI,
            gl.RG_INTEGER
        );
        this.#gapTextures.set(resolution, { cuts, texture });
        return texture;
    }

    /**
     * @param {WebGLTexture} texture
     * @param {Uint32Array} data
     * @param {number} width
     * @param {number} height
     * @param {number} internalFormat
     * @param {number} format
     */
    #uploadIntegerTexture(
        texture,
        data,
        width,
        height,
        internalFormat,
        format
    ) {
        const gl = this.glHelper.gl;
        // Lazy uploads must preserve samplers already bound for another axis.
        const boundTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            internalFormat,
            width,
            height,
            0,
            format,
            gl.UNSIGNED_INT,
            data
        );
        gl.bindTexture(gl.TEXTURE_2D, boundTexture);
    }

    /** @param {import("./gl/webGLHelper.js").default} glHelper */
    constructor(glHelper) {
        this.glHelper = glHelper;
        glHelper.setResourceFinalizer(() => this.dispose());
    }

    /** @param {import("../../marks/mark.js").default} mark */
    #createMarkEntry(mark) {
        this.#assertActive();
        const graphics = createWebGLMark(mark, this.glHelper, this);
        /** @type {WebGLMarkEntry} */
        const entry = {
            mark,
            graphics,
            state: "compiling",
            collector: undefined,
            dataRevision: -1,
            configurationRevision: -1,
            encodedDataRevision: -1,
            gapKey: groupingGapKey(mark.encoders),
            scaleResolutions: new Set(),
        };
        this.#markEntries.set(mark, entry);
        mark.unitView.registerDisposer(() => this.releaseMark(mark));

        try {
            this.#retainScaleResolutions(entry);
            graphics.initializeGraphics();
        } catch (error) {
            entry.state = "failed";
            this.#releaseScaleResolutions(entry);
            graphics.dispose();
            throw error;
        }

        return entry;
    }

    /** @param {Iterable<import("../../marks/mark.js").default>} marks */
    prepareMarks(marks) {
        const preparation = this.#startPreparingMarks(marks);
        try {
            this.#finishPreparingMarks(preparation.entries);
        } catch (error) {
            preparation.firstError ??= error;
        }
        if (preparation.firstError) {
            throw preparation.firstError;
        }
    }

    /**
     * @param {Iterable<import("../../marks/mark.js").default>} marks
     * @returns {{entries: WebGLMarkEntry[], firstError: unknown}}
     */
    #startPreparingMarks(marks) {
        this.#assertActive();
        /** @type {WebGLMarkEntry[]} */
        const entries = [];
        /** @type {unknown} */
        let firstError;
        for (const mark of new Set(marks)) {
            try {
                const previous = this.#markEntries.get(mark);
                if (
                    previous &&
                    previous.gapKey !== groupingGapKey(mark.encoders)
                ) {
                    this.releaseMark(mark);
                }
                const fontReady =
                    mark.getType() != "text" || getWebGlTextFont(mark).metrics;
                if (
                    !this.#markEntries.has(mark) &&
                    mark.encoders &&
                    fontReady
                ) {
                    entries.push(this.#createMarkEntry(mark));
                }
            } catch (error) {
                firstError ??= error;
            }
        }
        return { entries, firstError };
    }

    /** @param {Iterable<WebGLMarkEntry>} entries */
    hasStructuralChanges(entries) {
        return Array.from(entries).some(
            (entry) =>
                this.#markEntries.get(entry.mark) !== entry ||
                entry.gapKey !== groupingGapKey(entry.mark.encoders)
        );
    }

    /** @param {Iterable<WebGLMarkEntry>} entries */
    #finishPreparingMarks(entries) {
        // Finalize only after every missing shader program has been started.
        /** @type {unknown} */
        let firstError;
        for (const entry of entries) {
            try {
                entry.graphics.finalizeGraphicsInitialization();
                entry.state = "ready";
            } catch (error) {
                entry.state = "failed";
                this.#releaseScaleResolutions(entry);
                entry.graphics.dispose();
                firstError ??= error;
            }
        }
        if (firstError) {
            throw firstError;
        }
    }

    /** @param {import("../../marks/mark.js").default} mark */
    releaseMark(mark) {
        const entry = this.#markEntries.get(mark);
        if (!entry) {
            return;
        }
        this.#markEntries.delete(mark);
        entry.state = "disposed";
        entry.graphics.dispose();
        this.#releaseScaleResolutions(entry);
    }

    /** @param {import("../../marks/mark.js").default} mark */
    getMarkRenderingDebugState(mark) {
        const entry = this.#markEntries.get(mark);
        const state = entry?.graphics.getDebugState();
        return {
            ready: Boolean(entry?.state == "ready" && entry.graphics.isReady()),
            markUniformsAltered: state?.markUniformsAltered ?? false,
            vertexCount: state?.vertexCount,
            allocatedVertices: state?.allocatedVertices,
            rangeCount: state?.rangeCount ?? 0,
        };
    }

    /** @param {import("../../marks/mark.js").default} mark */
    getMarkEntry(mark) {
        return this.#markEntries.get(mark);
    }

    /** @param {WebGLMarkEntry} entry */
    isEntryActive(entry) {
        return (
            entry.state == "ready" &&
            this.#markEntries.get(entry.mark) === entry
        );
    }

    /** @param {WebGLMarkEntry} entry */
    isEntryDrawable(entry) {
        return this.isEntryActive(entry) && entry.graphics.isReady();
    }

    /** @param {Iterable<WebGLMarkEntry>} entries */
    synchronize(entries) {
        if (this.#disposed) {
            return;
        }
        for (const entry of entries) {
            if (!this.isEntryActive(entry)) {
                continue;
            }
            const mark = entry.mark;
            mark.initializeRenderingRevisions([], { trackResources: false });
            const collector = mark.unitView.getCollector();
            if (!collector?.completed) {
                continue;
            }
            if (
                entry.collector !== collector ||
                entry.dataRevision != collector.dataRevision ||
                entry.configurationRevision !=
                    mark.getRenderingRevision("configuration") ||
                entry.encodedDataRevision != mark.getEncodedDataRevision()
            ) {
                entry.graphics.updateGraphicsData(collector);
                this.#recordRevisions(entry);
            }
        }
    }

    /**
     * Starts loading a bitmap into a WebGL texture. The texture object is
     * returned immediately because mark initialization and bitmap decoding are
     * intentionally allowed to proceed in parallel.
     *
     * @param {string} bitmapUrl
     * @returns {Promise<void>}
     */
    prepareFontBitmap(bitmapUrl) {
        this.#assertActive();
        const existing = this.#fontTextures.get(bitmapUrl);
        if (existing) {
            return existing.ready;
        }

        const gl = this.glHelper.gl;
        /** @type {WebGLTexture} */
        let texture;
        const ready = new Promise((resolve, reject) => {
            texture = createTexture(
                gl,
                { src: bitmapUrl, min: gl.LINEAR },
                (error) => {
                    if (error) {
                        this.#fontTextures.delete(bitmapUrl);
                        gl.deleteTexture(texture);
                        reject(error);
                    } else if (this.#disposed) {
                        reject(
                            new Error(
                                "WebGL renderer resources were disposed while loading a font."
                            )
                        );
                    } else {
                        resolve();
                    }
                }
            );
        });
        this.#fontTextures.set(bitmapUrl, { texture, ready });

        return ready;
    }

    /** @param {string} bitmapUrl */
    getFontTexture(bitmapUrl) {
        this.#assertActive();
        const entry = this.#fontTextures.get(bitmapUrl);
        if (!entry) {
            throw new Error("Font bitmap has not been prepared: " + bitmapUrl);
        }
        return entry.texture;
    }

    dispose() {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        for (const mark of Array.from(this.#markEntries.keys())) {
            this.releaseMark(mark);
        }
        const gl = this.glHelper.gl;
        for (const { texture } of this.#fontTextures.values()) {
            gl.deleteTexture(texture);
        }
        this.#fontTextures.clear();
        for (const { texture } of this.#gapTextures.values())
            gl.deleteTexture(texture);
        this.#gapTextures.clear();
    }

    #assertActive() {
        if (this.#disposed) {
            throw new Error("WebGL renderer resources have been disposed.");
        }
    }

    /** @param {WebGLMarkEntry} entry */
    #recordRevisions(entry) {
        const mark = entry.mark;
        mark.initializeRenderingRevisions([], { trackResources: false });
        const collector = mark.unitView.getCollector();
        entry.collector = collector;
        entry.dataRevision = collector?.dataRevision ?? -1;
        entry.configurationRevision =
            mark.getRenderingRevision("configuration") ?? -1;
        entry.encodedDataRevision = mark.getEncodedDataRevision();
    }

    /** @param {WebGLMarkEntry} entry */
    #retainScaleResolutions(entry) {
        for (const [channel, encoder] of Object.entries(entry.mark.encoders)) {
            if (!encoder.scale) {
                continue;
            }
            const channelDef = findChannelDefWithScale(encoder.channelDef);
            const resolutionChannel = channelDef?.resolutionChannel ?? channel;
            if (!isChannelWithScale(resolutionChannel)) {
                continue;
            }
            const resolution =
                entry.mark.unitView.getScaleResolution(resolutionChannel);
            if (!resolution || entry.scaleResolutions.has(resolution)) {
                continue;
            }
            entry.scaleResolutions.add(resolution);
            this.#releaseDisabledGapTexture(resolution);

            const retained = this.#scaleResolutionRefs.get(resolution);
            if (retained) {
                retained.count++;
                continue;
            }

            this.glHelper.createRangeTexture(resolution);
            this.#updateCategoricalTexture(resolution);
            this.#scaleResolutionRefs.set(resolution, {
                count: 1,
                dispose: resolution.observeMapping(() => {
                    this.#releaseDisabledGapTexture(resolution);
                    this.glHelper.createRangeTexture(resolution, true);
                    this.#updateCategoricalTexture(resolution);
                }),
            });
        }
    }

    /** Gap ownership is independent of ordinary shared-scale references.
     * @param {import("../../scales/scaleResolution.js").default} resolution
     */
    #releaseDisabledGapTexture(resolution) {
        const gaps = this.#gapTextures.get(resolution);
        if (gaps && !hasGroupingGaps(resolution.getScale().props)) {
            this.glHelper.gl.deleteTexture(gaps.texture);
            this.#gapTextures.delete(resolution);
        }
    }

    /** @param {WebGLMarkEntry} entry */
    #releaseScaleResolutions(entry) {
        for (const resolution of entry.scaleResolutions) {
            const retained = this.#scaleResolutionRefs.get(resolution);
            if (!retained) {
                continue;
            }
            retained.count--;
            if (retained.count == 0) {
                retained.dispose();
                this.#scaleResolutionRefs.delete(resolution);
                const gaps = this.#gapTextures.get(resolution);
                if (gaps) this.glHelper.gl.deleteTexture(gaps.texture);
                this.#gapTextures.delete(resolution);
                const categorical = this.#categoricalTextures.get(resolution);
                if (categorical) this.glHelper.gl.deleteTexture(categorical);
                this.#categoricalTextures.delete(resolution);
            }
        }
        entry.scaleResolutions.clear();
    }
}
