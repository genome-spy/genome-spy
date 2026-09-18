import { InternMap } from "internmap";
import { createNativeFontDescriptor } from "./nativeText.js";

const MEASUREMENT_TEXT = "Mg";

/**
 * Browser-native text measurement backed by one detached Canvas2D context.
 */
export default class NativeTextMetricsProvider {
    /**
     * @param {CanvasRenderingContext2D} context
     * @param {FontFaceSet | undefined} [fontFaceSet]
     */
    constructor(context, fontFaceSet) {
        this.context = context;
        this.fontFaceSet = fontFaceSet;

        /** @type {Map<object, NativeFontMeasurement>} */
        this.measurements = new InternMap([], JSON.stringify);

        /** @type {Promise<unknown>[]} */
        this.pending = [];

        /** @type {string | undefined} */
        this.currentFont = undefined;
    }

    /** @param {import("../fonts/textMetrics.js").FontConfig} config */
    requestFont(config) {
        const descriptor = createNativeFontDescriptor(config);
        let measurement = this.measurements.get(descriptor);
        if (!measurement) {
            measurement = new NativeFontMeasurement(this, descriptor);
            this.measurements.set(descriptor, measurement);

            const loading = this.fontFaceSet?.load(
                createCanvasFont(descriptor, 16)
            );
            if (loading) {
                this.pending.push(
                    loading.then(() => measurement.invalidateCache())
                );
            }
        }
        return measurement;
    }

    async waitUntilReady() {
        await Promise.all(this.pending);
    }

    /**
     * @param {{style: string, weight: number, family: string}} descriptor
     * @param {number} fontSize
     */
    prepareContext(descriptor, fontSize) {
        const font = createCanvasFont(descriptor, fontSize);
        if (font != this.currentFont) {
            this.context.font = font;
            this.currentFont = font;
        }
        this.context.fontKerning = "normal";
        this.context.direction = "ltr";
        this.context.textAlign = "left";
        this.context.textBaseline = "alphabetic";
    }
}

class NativeFontMeasurement {
    /**
     * @param {NativeTextMetricsProvider} provider
     * @param {{style: string, weight: number, family: string}} descriptor
     */
    constructor(provider, descriptor) {
        this.provider = provider;
        this.descriptor = descriptor;
        this.cachedFontSize = NaN;
        this.asciiWidths = new Float64Array(128);
        this.asciiWidths.fill(NaN);
        this.cachedHeight = NaN;
    }

    /** @param {string} text @param {number} fontSize */
    measureWidth(text, fontSize) {
        if (fontSize != this.cachedFontSize) {
            this.cachedFontSize = fontSize;
            this.asciiWidths.fill(NaN);
            this.cachedHeight = NaN;
        }

        const code = text.length == 1 ? text.charCodeAt(0) : 128;
        if (code < 128) {
            const cached = this.asciiWidths[code];
            if (!Number.isNaN(cached)) {
                return cached;
            }
            const width = this.measureNative(text, fontSize).width;
            this.asciiWidths[code] = width;
            return width;
        }

        return this.measureNative(text, fontSize).width;
    }

    /** @param {number} fontSize */
    getHeight(fontSize) {
        if (fontSize != this.cachedFontSize) {
            this.cachedFontSize = fontSize;
            this.asciiWidths.fill(NaN);
            this.cachedHeight = NaN;
        }
        if (Number.isNaN(this.cachedHeight)) {
            const metrics = this.measureNative(MEASUREMENT_TEXT, fontSize);
            this.cachedHeight =
                metrics.actualBoundingBoxAscent +
                metrics.actualBoundingBoxDescent;
        }
        return this.cachedHeight;
    }

    invalidateCache() {
        this.cachedFontSize = NaN;
        this.asciiWidths.fill(NaN);
        this.cachedHeight = NaN;
    }

    /** @param {string} text @param {number} fontSize */
    measureNative(text, fontSize) {
        this.provider.prepareContext(this.descriptor, fontSize);
        return this.provider.context.measureText(text);
    }
}

/**
 * @param {{style: string, weight: number, family: string}} descriptor
 * @param {number} size
 */
function createCanvasFont(descriptor, size) {
    return `${descriptor.style} ${descriptor.weight} ${size}px ${descriptor.family}`;
}

/** @param {Document} document */
export function createNativeTextMetricsProvider(document) {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) {
        throw new Error("Canvas2D text measurement is unavailable.");
    }
    return new NativeTextMetricsProvider(context, document.fonts);
}

/**
 * Registers every text mark in a prepared hierarchy before awaiting the
 * provider, so drawing never discovers a new pending face.
 *
 * @param {import("../fonts/textMetrics.js").TextMetricsProvider} provider
 * @param {import("../view/view.js").default} viewRoot
 */
export async function prepareTextMetrics(provider, viewRoot) {
    viewRoot.visit((view) => {
        const mark =
            /** @type {{mark?: import("../marks/mark.js").default}} */ (view)
                .mark;
        if (mark?.getType() == "text") {
            provider.requestFont(
                /** @type {import("../spec/mark.js").TextProps} */ (
                    mark.properties
                )
            );
        }
    });
    await provider.waitUntilReady();
}
