import { InternMap } from "internmap";
import { measureTrueTypeTextWidth } from "@genome-spy/webgpu-renderer/fonts/truetype";
import { normalizeFontWeight } from "../nativeText.js";

/**
 * @typedef {import("@genome-spy/webgpu-renderer/fonts/truetype").TrueTypeFont} TrueTypeFont
 * @typedef {{ outlineFont: TrueTypeFont | undefined, measurement: import("../../fonts/textMetrics.js").FontMeasurement }} OutlineFontEntry
 */

export default class OutlineTextMetricsProvider {
    /**
     * @param {(request: {family: string | undefined, style: "normal" | "italic", weight: number, implicitFamily: boolean}) => Promise<object>} prepareFont
     * @param {import("../../fonts/textMetrics.js").TextMetricsProvider} provisionalProvider
     */
    constructor(prepareFont, provisionalProvider) {
        this.prepareFont = prepareFont;
        this.provisionalProvider = provisionalProvider;

        /** @type {Map<object, OutlineFontEntry>} */
        this.entries = new InternMap([], JSON.stringify);

        /** @type {Promise<void>[]} */
        this.pending = [];
    }

    /** @param {import("../../fonts/textMetrics.js").FontConfig} config */
    requestFont(config) {
        return this.#requestEntry(config).measurement;
    }

    /** @param {import("../../fonts/textMetrics.js").FontConfig} config */
    getPreparedFont(config) {
        return this.entries.get(normalizeRequest(config))?.outlineFont;
    }

    async waitUntilReady() {
        await Promise.all(this.pending);
    }

    /** @param {import("../../fonts/textMetrics.js").FontConfig} config */
    #requestEntry(config) {
        const request = normalizeRequest(config);
        let entry = this.entries.get(request);
        if (!entry) {
            const provisional = this.provisionalProvider.requestFont(config);
            entry = /** @type {OutlineFontEntry} */ ({
                outlineFont: undefined,
                measurement: undefined,
            });
            const retainedEntry = entry;
            entry.measurement = {
                measureWidth: (text, size) =>
                    retainedEntry.outlineFont
                        ? measureTrueTypeTextWidth(
                              retainedEntry.outlineFont,
                              text,
                              size
                          )
                        : provisional.measureWidth(text, size),
                getHeight: (size) =>
                    retainedEntry.outlineFont
                        ? ((retainedEntry.outlineFont.capHeight -
                              retainedEntry.outlineFont.descender) /
                              retainedEntry.outlineFont.unitsPerEm) *
                          size
                        : provisional.getHeight(size),
            };
            this.entries.set(request, entry);
            this.pending.push(
                this.prepareFont(request).then((font) => {
                    retainedEntry.outlineFont = /** @type {TrueTypeFont} */ (
                        font
                    );
                })
            );
        }
        return entry;
    }
}

/** @param {import("../../fonts/textMetrics.js").FontConfig} config */
function normalizeRequest(config) {
    const implicitFamily =
        config.font == null || config.font.toLowerCase() == "sans-serif";
    return {
        family: implicitFamily ? undefined : config.font,
        style: config.fontStyle ?? "normal",
        weight: normalizeFontWeight(config.fontWeight ?? "normal"),
        implicitFamily,
    };
}
