const BASE = 41.454;
const HEIGHT = 37.622;
const ASCII_START = 32;
const ASCII_END = 126;
const FALLBACK_ADVANCE = 18.795;

// Lato Regular advances keep headless layout deterministic without retaining
// a renderer-specific font format in the generic runtime.
const ASCII_ADVANCES = [
    10.752, 11.298, 15.561, 24.36, 24.36, 33.663, 29.904, 8.568, 11.214, 11.214,
    17.85, 24.36, 9.534, 15.603, 9.912, 18.984, 24.36, 24.36, 24.36, 24.36,
    24.36, 24.36, 24.36, 24.36, 24.36, 24.36, 10.5, 10.983, 24.36, 24.36, 24.36,
    18.795, 35.133, 28.434, 27.153, 28.056, 31.941, 24.255, 23.751, 30.681,
    32.067, 11.76, 17.745, 27.825, 21.567, 38.997, 32.067, 33.621, 25.221,
    33.621, 26.313, 22.785, 24.801, 30.891, 28.434, 43.491, 27.258, 26.208,
    25.284, 12.852, 18.984, 12.852, 24.36, 19.278, 16.8, 20.874, 23.52, 20.055,
    23.52, 22.176, 14.721, 21.84, 23.436, 10.08, 10.08, 21.336, 9.912, 34.545,
    23.436, 23.814, 23.541, 23.52, 15.288, 18.186, 15.057, 23.415, 21.672,
    32.991, 20.916, 21.651, 18.984, 12.642, 10.521, 12.642, 24.36,
];

const measurement = {
    /** @param {string} text @param {number} fontSize */
    measureWidth(text, fontSize) {
        let width = 0;
        for (let i = 0; i < text.length; i++) {
            let code = text.charCodeAt(i);
            if (code == 8722) {
                code = 45;
            }
            width +=
                code >= ASCII_START && code <= ASCII_END
                    ? ASCII_ADVANCES[code - ASCII_START]
                    : FALLBACK_ADVANCE;
        }
        return (width / BASE) * fontSize;
    },

    /** @param {number} fontSize */
    getHeight: (fontSize) => (HEIGHT / BASE) * fontSize,
};

/** Deterministic text metrics for DOM-free layout and tests. */
export default class HeadlessTextMetricsProvider {
    requestFont() {
        return measurement;
    }

    /** @returns {Promise<void>} */
    async waitUntilReady() {}
}
