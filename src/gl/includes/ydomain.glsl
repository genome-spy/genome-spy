
uniform highp float uYScale;
uniform highp float uYTranslate;

uniform float uYOffset;

attribute highp float y;

/**
 * Does viewport (track) transformation and returns the Y coordinate on normalized [0, 1] scale
 */
float normalizeY() {
    // https://stackoverflow.com/a/47543127
    const float FLT_MAX =  3.402823466e+38;

    if (y <= -FLT_MAX) {
        return 0.0;
    } else if (y >= FLT_MAX) {
        return 1.0;
    } else {
        return y * uYScale + uYTranslate + uYOffset;
    }
}