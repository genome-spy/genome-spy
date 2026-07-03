flat out lowp vec4 vFillColor;
flat out lowp vec4 vStrokeColor;
flat out float vHalfStrokeWidth;
flat out vec2 vArrowHalfSizeInPixels;
flat out float vHeadHalfWidth;
flat out float vStemHalfWidth;
flat out float vHeadStrokeWidth;
flat out float vRHeadSlope;
flat out float vRHeadNotchSlope;
flat out float vRStartNotchSlope;
flat out float vHeadFootprintLength;

out vec2 vPosInPixels;

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

float resolveStemHalfWidth(float markHalfWidth) {
    float markWidth = markHalfWidth * 2.0;
    float stemWidth = unitValue(uStemWidth, uStemWidthUnit, markWidth);
    return clamp(stemWidth, 0.0, markWidth) * 0.5;
}

float resolveHeadHalfWidth(float markHalfWidth) {
    float markWidth = markHalfWidth * 2.0;
    float headWidth = unitValue(uHeadWidth, uHeadWidthUnit, markWidth);
    return clamp(headWidth, 0.0, markWidth) * 0.5;
}

float headFootprintLength(
    float halfWidth,
    float rHeadSlope,
    float headStrokeWidth,
    float halfStrokeWidth
) {
    float headAxisLength = halfWidth * rHeadSlope;
    float headStrokeLength = headStrokeWidth / length(vec2(rHeadSlope, 1.0));
    return headAxisLength + headStrokeLength + halfStrokeWidth;
}

// Distance from the head tip to its centerline notch/join point.
float headNotchOffset(
    float headHalfWidth,
    float rHeadSlope,
    float rHeadNotchSlope,
    float headStrokeWidth
) {
    if (headHalfWidth <= 0.0) {
        return 0.0;
    }

    float headAxisLength = headHalfWidth * rHeadSlope;
    vec2 topOuter = vec2(headAxisLength, headHalfWidth);
    vec2 normalOffset = headStrokeWidth
        * normalize(vec2(headHalfWidth, -headAxisLength));
    vec2 topInner = topOuter + normalOffset;
    return topInner.x - topInner.y * rHeadNotchSlope;
}

// Distance from the arrow tip to where the stem outer edge meets a filled
// triangle head's notch edge.
float triangleHeadStemJoinLength(
    float stemHalfWidth,
    float headHalfWidth,
    float rHeadSlope,
    float rHeadNotchSlope
) {
    float clampedRHeadNotchSlope = min(rHeadNotchSlope, rHeadSlope);
    return headHalfWidth * rHeadSlope
        - (headHalfWidth - stemHalfWidth) * clampedRHeadNotchSlope;
}

// Blunt filled, non-repeated heads toward 90 degrees to preserve stem length.
float effectiveHeadSlope(
    float halfLength,
    float headHalfWidth,
    float stemHalfWidth,
    float configuredRHeadSlope,
    float configuredRHeadNotchSlope
) {
    if (
        uHeadPlacement == HEAD_PLACEMENT_OUTSIDE ||
        uHeadRepeat ||
        uHeadShape != HEAD_SHAPE_TRIANGLE ||
        uMinStemLength <= 0.0
    ) {
        return configuredRHeadSlope;
    }

    float maxJoinLength = max(
        halfLength * 2.0 - uMinStemLength,
        0.0
    );
    float configuredJoinLength = triangleHeadStemJoinLength(
        stemHalfWidth,
        headHalfWidth,
        configuredRHeadSlope,
        configuredRHeadNotchSlope
    );

    if (configuredJoinLength <= maxJoinLength) {
        return configuredRHeadSlope;
    }

    float boundaryJoinLength = stemHalfWidth * configuredRHeadNotchSlope;
    if (maxJoinLength < boundaryJoinLength) {
        return stemHalfWidth > 0.0
            ? clamp(maxJoinLength / stemHalfWidth, 0.0, configuredRHeadSlope)
            : 0.0;
    } else {
        return clamp(
            (
                maxJoinLength +
                (headHalfWidth - stemHalfWidth) * configuredRHeadNotchSlope
            ) / headHalfWidth,
            0.0,
            configuredRHeadSlope
        );
    }
}

float getOutsideHeadOffset(vec2 sizeInPixels) {
    if (uHeadPlacement != HEAD_PLACEMENT_OUTSIDE) {
        return 0.0;
    }

    vec2 arrowHalfSize = toArrowSpace(sizeInPixels * 0.5);
    float stemHalfWidth = resolveStemHalfWidth(arrowHalfSize.y);
    float headHalfWidth = resolveHeadHalfWidth(arrowHalfSize.y);
    float headStrokeWidth = uHeadShape == HEAD_SHAPE_ANGLE
        ? stemHalfWidth * 2.0
        : 0.0;
    float rHeadSlope = effectiveHeadSlope(
        arrowHalfSize.x,
        headHalfWidth,
        stemHalfWidth,
        1.0 / uHeadSlope,
        1.0 / uHeadNotchSlope
    );
    float rHeadNotchSlope = uHeadShape == HEAD_SHAPE_ANGLE
        ? rHeadSlope
        : min(1.0 / uHeadNotchSlope, rHeadSlope);

    return headNotchOffset(
        headHalfWidth,
        rHeadSlope,
        rHeadNotchSlope,
        headStrokeWidth
    );
}

vec2 getOutsideHeadExpansion(float outsideHeadOffset) {
    if (uHeadPlacement != HEAD_PLACEMENT_OUTSIDE) {
        return vec2(0.0);
    }

    bool endHeadPositive = uDirection == DIRECTION_FORWARD;
    bool endHeadNegative = uDirection == DIRECTION_REVERSE;

    float negative = endHeadNegative ? outsideHeadOffset : 0.0;
    float positive = endHeadPositive ? outsideHeadOffset : 0.0;

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

    float strokeWidth = getScaled_strokeWidth();
    float strokeOpacity = getScaled_strokeOpacity() * uViewOpacity;
    vHalfStrokeWidth = strokeWidth / 2.0;

    vec2 sizeInPixels = size * uViewportSize;

    float outsideHeadOffset = getOutsideHeadOffset(sizeInPixels);
    vec2 outsideHeadExpansion = getOutsideHeadExpansion(outsideHeadOffset);
    if (uOrient == ORIENT_HORIZONTAL) {
        vec2 expansion = outsideHeadExpansion / uViewportSize.x;
        pos.x += mix(-expansion.x, expansion.y, frac.x);
        size.x += expansion.x + expansion.y;
    } else {
        vec2 expansion = outsideHeadExpansion / uViewportSize.y;
        pos.y += mix(-expansion.x, expansion.y, frac.y);
        size.y += expansion.x + expansion.y;
    }

    float aaPadding = 1.0 / uDevicePixelRatio;
    vec2 centeredFrac = frac - 0.5;
    vec2 expand = centeredFrac * (strokeWidth + aaPadding) / uViewportSize;
    pos += expand;

    sizeInPixels = size * uViewportSize;
    vPosInPixels = (centeredFrac + expand / size) * sizeInPixels;
    vec2 halfSizeInPixels = sizeInPixels / 2.0;

    vArrowHalfSizeInPixels = toArrowSpace(halfSizeInPixels);
    vHeadHalfWidth = resolveHeadHalfWidth(vArrowHalfSizeInPixels.y);
    vStemHalfWidth = resolveStemHalfWidth(vArrowHalfSizeInPixels.y);
    vHeadStrokeWidth = uHeadShape == HEAD_SHAPE_ANGLE
        ? vStemHalfWidth * 2.0
        : 0.0;
    float configuredRHeadSlope = 1.0 / uHeadSlope;
    float configuredRHeadNotchSlope = 1.0 / uHeadNotchSlope;
    vRHeadSlope = effectiveHeadSlope(
        vArrowHalfSizeInPixels.x,
        vHeadHalfWidth,
        vStemHalfWidth,
        configuredRHeadSlope,
        configuredRHeadNotchSlope
    );
    vRHeadNotchSlope = uHeadShape == HEAD_SHAPE_ANGLE
        ? vRHeadSlope
        : min(configuredRHeadNotchSlope, vRHeadSlope);
    vRStartNotchSlope = uStartNotch ? vRHeadSlope : 0.0;
    vHeadFootprintLength = headFootprintLength(
        vHeadHalfWidth,
        vRHeadSlope,
        vHeadStrokeWidth,
        vHalfStrokeWidth
    );
    vStrokeColor = vec4(getScaled_stroke() * strokeOpacity, strokeOpacity);

    gl_Position = unitToNdc(pos);

    float fillOpacity = getScaled_fillOpacity() * uViewOpacity;
    vFillColor = vec4(getScaled_fill() * fillOpacity, fillOpacity);

    setupPicking();
}
