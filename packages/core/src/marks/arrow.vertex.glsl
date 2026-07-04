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
flat out float vHeadRepeatFootprintLength;
flat out float vHeadSpacing;
flat out float vDirection;

out vec2 vPosInPixels;

/** Position along the arrow centerline. */
in float pos;

/** Which side of the extruded strip: -0.5 or 0.5. */
in float side;

float resolveStemHalfWidth(float arrowSize) {
    if (uStem) {
        return arrowSize * 0.5;
    } else {
        // The negative sign hides stem geometry; the magnitude remains
        // available for open-head thickness.
        return -arrowSize * 0.5;
    }
}

float resolveHeadHalfWidth(float arrowSize) {
    float headWidth = uHeadWidth * arrowSize;
    return max(headWidth, 0.0) * 0.5;
}

// Width along the arrow axis needed by one repeated head, including stroke.
float headRepeatFootprintLength(
    float halfWidth,
    float rHeadSlope,
    float headStrokeWidth,
    float halfStrokeWidth
) {
    float headAxisLength = halfWidth * rHeadSlope;
    float headStrokeLength = headStrokeWidth / length(vec2(rHeadSlope, 1.0));
    return headAxisLength + headStrokeLength + halfStrokeWidth * 2.0;
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
// triangle head's notch edge. This is the effective occupied head length for
// deciding when a short inside arrow needs to blunt its head angle.
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

// Blunt non-repeated heads toward 90 degrees to preserve visible stem length.
float effectiveHeadSlope(
    float halfLength,
    float headHalfWidth,
    float stemHalfWidth,
    float configuredRHeadSlope,
    float configuredRHeadNotchSlope,
    bool headRepeat
) {
    if (
        headRepeat ||
        stemHalfWidth < 0.0
    ) {
        return configuredRHeadSlope;
    }

    if (uHeadPlacement == HEAD_PLACEMENT_OUTSIDE) {
        if (!uStartNotch || stemHalfWidth <= 0.0) {
            return configuredRHeadSlope;
        }

        // Outside heads start at the encoded endpoint. The preserved length is
        // therefore the encoded arrow length minus the start notch depth.
        float maxStartNotchLength = max(
            halfLength * 2.0 - uMinStemLength,
            0.0
        );
        return min(
            configuredRHeadSlope,
            maxStartNotchLength / stemHalfWidth
        );
    }

    if (uHeadShape != HEAD_SHAPE_TRIANGLE) {
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

// Outside placement extends the vertex quad so the head can protrude past the
// encoded interval while its notch/join point stays on the endpoint.
float getOutsideHeadOffset(
    float headHalfWidth,
    float rHeadSlope,
    float rHeadNotchSlope,
    float headStrokeWidth
) {
    if (uHeadPlacement != HEAD_PLACEMENT_OUTSIDE) {
        return 0.0;
    }

    return headNotchOffset(
        headHalfWidth,
        rHeadSlope,
        rHeadNotchSlope,
        headStrokeWidth
    );
}

vec2 getOutsideHeadExpansion(float outsideHeadOffset, float direction) {
    // Expansion is stored as negative/positive arrow-axis growth. In the
    // canonical reverse direction, the head is on the negative side.
    return direction == DIRECTION_REVERSE
        ? vec2(outsideHeadOffset, 0.0)
        : vec2(0.0, outsideHeadOffset);
}

void main(void) {
    vec2 a = applySampleFacet(vec2(getScaled_x(), getScaled_y()));
    vec2 b = applySampleFacet(vec2(getScaled_x2(), getScaled_y2()));
    float direction = getScaled_direction();

    vec2 segmentInPixels = (b - a) * uViewportSize;
    float segmentLength = length(segmentInPixels);
    if (segmentLength <= 0.0) {
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    float strokeWidth = getScaled_strokeWidth();
    float strokeOpacity = getScaled_strokeOpacity() * uViewOpacity;
    vHalfStrokeWidth = strokeWidth / 2.0;

    float arrowSize = max(getScaled_size(), uMinSize);
    float headHalfWidth = resolveHeadHalfWidth(arrowSize);
    float stemHalfWidth = resolveStemHalfWidth(arrowSize);
    float physicalStemHalfWidth = abs(stemHalfWidth);
    float headStrokeWidth = uHeadShape == HEAD_SHAPE_OPEN
        ? physicalStemHalfWidth * 2.0
        : 0.0;
    float configuredRHeadSlope = 1.0 / uHeadSlope;
    float configuredRHeadNotchSlope = 1.0 / uHeadNotchSlope;
    float rHeadSlope = effectiveHeadSlope(
        segmentLength * 0.5,
        headHalfWidth,
        stemHalfWidth,
        configuredRHeadSlope,
        configuredRHeadNotchSlope,
        uHeadSpacing >= 0.0
    );
    float rHeadNotchSlope = uHeadShape == HEAD_SHAPE_OPEN
        ? rHeadSlope
        : min(configuredRHeadNotchSlope, rHeadSlope);

    // Grow only the head side of the vertex quad for outside placement.
    float outsideHeadOffset = getOutsideHeadOffset(
        headHalfWidth,
        rHeadSlope,
        rHeadNotchSlope,
        headStrokeWidth
    );
    vec2 outsideHeadExpansion = getOutsideHeadExpansion(
        outsideHeadOffset,
        direction
    );

    float aaPadding = 1.0 / uDevicePixelRatio;
    float stripHalfWidth = max(headHalfWidth, physicalStemHalfWidth)
        + vHalfStrokeWidth
        + aaPadding;

    float reverseExpansion = outsideHeadExpansion.x;
    float forwardExpansion = outsideHeadExpansion.y;
    float localStart = -segmentLength * 0.5 - reverseExpansion;
    float localEnd = segmentLength * 0.5 + forwardExpansion;
    float localCenter = (localStart + localEnd) * 0.5;
    float localAxisPosition = mix(localStart, localEnd, pos);
    float localX = localAxisPosition - localCenter;
    float localY = side * stripHalfWidth * 2.0;

    vec2 tangentInPixels = segmentInPixels / segmentLength;
    vec2 normalInPixels = vec2(-tangentInPixels.y, tangentInPixels.x);
    vec2 segmentCenter = (a + b) * 0.5;
    vec2 p = segmentCenter
        + (tangentInPixels * localAxisPosition + normalInPixels * localY)
            / uViewportSize;

    vPosInPixels = vec2(localX, localY);
    vArrowHalfSizeInPixels = vec2(
        (localEnd - localStart) * 0.5,
        stripHalfWidth
    );

    // These flat varyings are per-arrow geometry constants used by the fragment
    // SDF. Keeping them here avoids repeating this math per fragment.
    vHeadHalfWidth = headHalfWidth;
    vStemHalfWidth = stemHalfWidth;
    vHeadStrokeWidth = headStrokeWidth;
    vRHeadSlope = rHeadSlope;
    vRHeadNotchSlope = rHeadNotchSlope;
    vRStartNotchSlope = uStartNotch ? vRHeadSlope : 0.0;
    vDirection = direction;
    vHeadRepeatFootprintLength = headRepeatFootprintLength(
        vHeadHalfWidth,
        vRHeadSlope,
        vHeadStrokeWidth,
        vHalfStrokeWidth
    );
    vHeadSpacing = uHeadSpacing >= 0.0 ? uHeadSpacing * arrowSize : -1.0;
    vStrokeColor = vec4(getScaled_stroke() * strokeOpacity, strokeOpacity);

    gl_Position = unitToNdc(p);

    float fillOpacity = getScaled_fillOpacity() * uViewOpacity;
    vFillColor = vec4(getScaled_fill() * fillOpacity, fillOpacity);

    setupPicking();
}
