
#pragma SCALES_HERE

in lowp vec3 color;

/** Mainly needed by band scale */
in float xFrac;
in float yFrac;

/** Minimum size (width, height) of the displayed rectangle in pixels */
uniform vec2 uMinSize;

/** Minimum opacity for the size size clamping */
uniform float uMinOpacity;

out vec4 vColor;

/**
 * Clamps the minimumSize and returns an opacity that reflects the amount of clamping.
 */
float clampMinSize(inout float pos, float size, float minSize) {
    if (minSize > 0.0 && abs(size) < minSize) {
        pos -= (minSize * sign(size) - size) / 2.0;
        return abs(size) / minSize;
    }

    return 1.0;
}

void main(void) {
    vec2 normalizedMinSize = uMinSize / uViewportSize;

    vec2 pos1 = vec2(getScaled_x(), getScaled_y());
    vec2 pos2 = vec2(getScaled_x2(), getScaled_y2());
    vec2 size = pos2 - pos1;

    // Do extra tricks to maintain precision at the endpoints 
    // Equivalent to: pos = pos1 + vec2(xFrac, yFrac) * size;
    vec2 pos = vec2(
        xFrac < 0.5 ? (pos1.x + xFrac * size.x) : (pos2.x - (1.0 - xFrac) * size.x),
        yFrac < 0.5 ? (pos1.y + yFrac * size.y) : (pos2.y - (1.0 - yFrac) * size.y)
    );

    size.y /= getSampleFacetHeight(pos);

    float opa = getScaled_opacity() * uViewOpacity * max(uMinOpacity,
        clampMinSize(pos.x, size.x, normalizedMinSize.x) *
        clampMinSize(pos.y, size.y, normalizedMinSize.y));

    pos = applySampleFacet(pos);

    gl_Position = unitToNdc(pos);

    vColor = vec4(color * opa, opa);

}
