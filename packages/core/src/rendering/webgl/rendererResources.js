import { createTexture } from "twgl.js";
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
 * @prop {number} encodedDataRevision
 * @prop {Set<import("../../scales/scaleResolution.js").default>} scaleResolutions
 */

export default class WebGLRendererResources {
    #disposed = false;

    /** @type {Map<import("../../marks/mark.js").default, WebGLMarkEntry>} */
    #markEntries = new Map();

    /** @type {Map<import("../../scales/scaleResolution.js").default, {count: number, listener: () => void}>} */
    #scaleResolutionRefs = new Map();

    /** @type {Map<string, {texture: WebGLTexture, ready: Promise<void>}>} */
    #fontTextures = new Map();

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
                const font = /** @type {{ metrics?: unknown } | undefined} */ (
                    /** @type {any} */ (mark).font
                );
                const fontReady = mark.getType() != "text" || font?.metrics;
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

            const retained = this.#scaleResolutionRefs.get(resolution);
            if (retained) {
                retained.count++;
                continue;
            }

            const listener = () =>
                this.glHelper.createRangeTexture(resolution, true);
            this.glHelper.createRangeTexture(resolution);
            resolution.addEventListener("domain", listener);
            resolution.addEventListener("range", listener);
            this.#scaleResolutionRefs.set(resolution, {
                count: 1,
                listener,
            });
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
                resolution.removeEventListener("domain", retained.listener);
                resolution.removeEventListener("range", retained.listener);
                this.#scaleResolutionRefs.delete(resolution);
            }
        }
        entry.scaleResolutions.clear();
    }
}
