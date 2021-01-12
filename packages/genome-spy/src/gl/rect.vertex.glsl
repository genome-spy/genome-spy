
#pragma SCALES_HERE

/** Mainly needed by band scale */
in vec2 frac;

/** Minimum size (width, height) of the displayed rectangle in pixels */
uniform vec2 uMinSize;

/** Minimum opacity for the size size clamping */
uniform float uMinOpacity;

flat out vec4 vColor;

/**
 * Clamps the minimumSize and returns an opacity that reflects the amount of clamping.
 */
float clampMinSize(inout float pos, float frac, float size, float minSize) {
    if (minSize > 0.0 && abs(size) < minSize) {
        pos += (frac - 0.5) * (minSize * sign(size) - size);
        return abs(size) / minSize;
    }

    return 1.0;
}

void main(void) {
    vec2 normalizedMinSize = uMinSize / uViewportSize;

    vec2 pos1 = vec2(getScaled_x(), getScaled_y());
    vec2 pos2 = vec2(getScaled_x2(), getScaled_y2());
    vec2 size = pos2 - pos1;

    vec2 fracSize = frac * size;
    // Do extra tricks to maintain precision at the endpoints 
    // Equivalent to: pos = pos1 + fracSize;
    vec2 pos = vec2(
        frac.x < 0.5 ? (pos1.x + fracSize.x) : (pos2.x + fracSize.x - size.x),
        frac.y < 0.5 ? (pos1.y + fracSize.y) : (pos2.y + fracSize.y - size.y)
    );

    size.y /= getSampleFacetHeight(pos);

    float opa = getScaled_opacity() * uViewOpacity * max(uMinOpacity,
        clampMinSize(pos.x, frac.x, size.x, normalizedMinSize.x) *
        clampMinSize(pos.y, frac.y, size.y, normalizedMinSize.y));

    pos = applySampleFacet(pos);

    gl_Position = unitToNdc(pos);

    vColor = vec4(getScaled_color() * opa, opa);
}
