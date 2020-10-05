
#pragma SCALES_HERE

attribute lowp vec3 color;

/**
 * Height of the rectangle.
 *
 * Negative if the top vertex, positive if the bottom vertex.
 */
attribute float height;
attribute float width;

/** Minimum size (width, height) of the displayed rectangle in pixels */
uniform vec2 uMinSize;

/** Minimum opacity for the size size clamping */
uniform float uMinOpacity;


varying vec4 vColor;

/**
 * Clamps the minimumSize and returns an opacity that reflects the amount of clamping.
 */
float clampMinSize(inout float pos, float size, float minSize) {
    if (abs(size) < minSize) {
        pos += (minSize * sign(size) - size) / 2.0;
        return abs(size) / minSize;
    }

    return 1.0;
}

void main(void) {
    float x = getScaled_x();
    float y = getScaled_y();
    
    //float translatedY = transit(x, y)[0];

    float sampleHeight = yPosLeft[1]; // TODO: The right side should be taken into account too

    vec2 normalizedMinSize = uMinSize / uViewportSize;

    float opa = getScaled_opacity() * max(uMinOpacity, 
        clampMinSize(x, scale_x(attr_x + width) - x, normalizedMinSize.x) *
        clampMinSize(y, (scale_y(attr_y + height) - y) * sampleHeight, normalizedMinSize.y));

    gl_Position = unitToNdc(x, y);

    vColor = vec4(color * opa, opa);

}
