flat out lowp vec4 vFillColor;
flat out lowp vec4 vStrokeColor;
flat out float vHalfStrokeWidth;

out vec2 vPosInPixels;

flat out vec2 vHalfSizeInPixels;
flat out float vBodyLengthInPixels;

void sort(inout float a, inout float b) {
    if (a > b) {
        float tmp = b;
        b = a;
        a = tmp;
    }
}

vec2 getVertexPos() {
    int index = gl_VertexID % 6;
    return vec2(
        index == 0 || index == 1 || index == 3 ? 0.0 : 1.0,
        index == 0 || index == 1 || index == 2 ? 0.0 : 1.0
    );
}

float unitValue(float value, int unit, float reference) {
    if (unit == UNIT_PROPORTION) {
        return value * reference;
    } else {
        return value;
    }
}

bool hasEndHead() {
    return uHeads == HEADS_END || uHeads == HEADS_BOTH;
}

bool hasStartHead() {
    return uHeads == HEADS_START || uHeads == HEADS_BOTH;
}

vec2 getOutsideHeadExpansion(vec2 sizeInPixels) {
    if (uHeadPlacement != HEAD_PLACEMENT_OUTSIDE) {
        return vec2(0.0);
    }

    float bodyLength = uOrient == ORIENT_HORIZONTAL
        ? sizeInPixels.x
        : sizeInPixels.y;
    float headLength = max(
        unitValue(uHeadLength, uHeadLengthUnit, bodyLength),
        0.0
    );

    bool endHeadPositive = hasEndHead() && uDirection == DIRECTION_FORWARD;
    bool endHeadNegative = hasEndHead() && uDirection == DIRECTION_REVERSE;
    bool startHeadNegative = hasStartHead() && uDirection == DIRECTION_FORWARD;
    bool startHeadPositive = hasStartHead() && uDirection == DIRECTION_REVERSE;

    float negative = endHeadNegative || startHeadNegative ? headLength : 0.0;
    float positive = endHeadPositive || startHeadPositive ? headLength : 0.0;

    return vec2(negative, positive);
}

void main(void) {
    vec2 frac = getVertexPos();

    float x = getScaled_x();
    float x2 = getScaled_x2();
    float y = getScaled_y();
    float y2 = getScaled_y2();

    sort(x, x2);
    sort(y, y2);

    float clampMargin = 1.0;
    vec2 pos1 = vec2(clamp(x, 0.0 - clampMargin, 1.0 + clampMargin), y);
    vec2 pos2 = vec2(clamp(x2, 0.0 - clampMargin, 1.0 + clampMargin), y2);

    vec2 size = pos2 - pos1;

    if (size.x < 0.0 || size.y < 0.0) {
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec2 pos = pos1 + frac * size;
    size.y *= getSampleFacetHeight(pos);
    pos = applySampleFacet(pos);

    vec2 sizeInPixels = size * uViewportSize;
    vBodyLengthInPixels = uOrient == ORIENT_HORIZONTAL
        ? sizeInPixels.x
        : sizeInPixels.y;

    vec2 outsideHeadExpansion = getOutsideHeadExpansion(sizeInPixels);
    if (uOrient == ORIENT_HORIZONTAL) {
        vec2 expansion = outsideHeadExpansion / uViewportSize.x;
        pos.x += mix(-expansion.x, expansion.y, frac.x);
        size.x += expansion.x + expansion.y;
    } else {
        vec2 expansion = outsideHeadExpansion / uViewportSize.y;
        pos.y += mix(-expansion.x, expansion.y, frac.y);
        size.y += expansion.x + expansion.y;
    }

    float strokeWidth = getScaled_strokeWidth();
    float strokeOpacity = getScaled_strokeOpacity() * uViewOpacity;

    float aaPadding = 1.0 / uDevicePixelRatio;
    vec2 centeredFrac = frac - 0.5;
    vec2 expand = centeredFrac * (strokeWidth + aaPadding) / uViewportSize;
    pos += expand;

    sizeInPixels = size * uViewportSize;
    vPosInPixels = (centeredFrac + expand / size) * sizeInPixels;
    vHalfSizeInPixels = sizeInPixels / 2.0;

    vHalfStrokeWidth = strokeWidth / 2.0;
    vStrokeColor = vec4(getScaled_stroke() * strokeOpacity, strokeOpacity);

    gl_Position = unitToNdc(pos);

    float fillOpacity = getScaled_fillOpacity() * uViewOpacity;
    vFillColor = vec4(getScaled_fill() * fillOpacity, fillOpacity);

    setupPicking();
}
