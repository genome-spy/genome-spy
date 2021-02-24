/**
 * The vertex position wrt the rectangle specified by (x, x2, y, y2).
 * [0, 0] = [x, y], [1, 1] = [x2, y2]. 
 * The x or y component may contain fractional values if the rectangle 
 * have been tessellated.
 */
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

void sort(inout float a, inout float b) {
    if (a > b) {
        float tmp = b;
        b = a;
        a = tmp;
    }
}

void main(void) {
    vec2 normalizedMinSize = uMinSize / uViewportSize;

    float x = getScaled_x();
    float x2 = getScaled_x2();
    float y = getScaled_y();
    float y2 = getScaled_y2();

    sort(x, x2);
    sort(y, y2);

    // Clamp x to unit range to prevent precision artifacts when the scale is zoomed very close.
    vec2 pos1 = vec2(clamp(x, 0.0, 1.0), y);
    vec2 pos2 = vec2(clamp(x2, 0.0, 1.0), y2);

    vec2 size = pos2 - pos1;

    if (size.x <= 0.0 && size.y <= 0.0) {
        // Early exit. May increase performance or not...
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec2 pos = pos1 + frac * size;

    size.y /= getSampleFacetHeight(pos);

    float opa = getScaled_opacity() * uViewOpacity * max(uMinOpacity,
        clampMinSize(pos.x, frac.x, size.x, normalizedMinSize.x) *
        clampMinSize(pos.y, frac.y, size.y, normalizedMinSize.y));

    pos = applySampleFacet(pos);

    gl_Position = unitToNdc(pos);

    vColor = vec4(getScaled_color() * opa, opa);
}
