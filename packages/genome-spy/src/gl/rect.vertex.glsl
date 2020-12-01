
#pragma SCALES_HERE

in lowp vec3 color;

/**
 * Height of the rectangle.
 *
 * Negative if the top vertex, positive if the bottom vertex.
 */
in float height;
in float width;

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
        pos += (minSize * sign(size) - size) / 2.0;
        return abs(size) / minSize;
    }

    return 1.0;
}

void main(void) {
    vec2 pos = applySampleFacet(
        vec2(getScaled_x(), getScaled_y())
    );
    
    float x = pos.x;
    float y = pos.y;

    float facetedHeight = height * getSampleFacetHeight(pos);

    vec2 normalizedMinSize = uMinSize / uViewportSize;

    float opa = getScaled_opacity() * max(uMinOpacity, 
        // TODO: "attr_x + width" likely fails with fp64
        clampMinSize(x, scale_x(attr_x + width) - x, normalizedMinSize.x) *
        clampMinSize(y, scale_y(attr_y + facetedHeight) - y, normalizedMinSize.y));

    gl_Position = unitToNdc(x, y);

    vColor = vec4(color * opa, opa);

}
