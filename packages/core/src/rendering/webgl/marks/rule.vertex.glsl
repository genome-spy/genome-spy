// Line caps
const int BUTT = 0;
const int SQUARE = 1;
const int ROUND = 2;

/** Position along the rule */
in float pos;

/** Which side of the stroke: -0.5 or 0.5 */
in float side;

flat out vec4 vColor;

/** Stroke width */
flat out float vSize;
flat out float vOuterSize;

/** The distance from the line center to the direction of normal in pixels */
out float vNormalLengthInPixels;

/** Distances from the line endings. Used for rendering the round caps and dashes */
out highp vec2 vPosInPixels;

// Intersect the segment with a slab, preserving its direction. Centering the
// interpolation avoids subtracting two large positions at high zoom.
bool clipRuleAxis(inout vec2 a, inout vec2 b, int axis, vec2 bounds) {
    float delta = b[axis] - a[axis];
    if (delta == 0.0) {
        return a[axis] >= bounds.x && a[axis] <= bounds.y;
    }
    if (max(a[axis], b[axis]) < bounds.x || min(a[axis], b[axis]) > bounds.y) {
        return false;
    }
    vec2 center = (a + b) * 0.5;
    vec2 direction = (b - a) / delta;
    if (a[axis] < bounds.x || a[axis] > bounds.y) {
        float edge = clamp(a[axis], bounds.x, bounds.y);
        a = center + direction * (edge - center[axis]);
        a[axis] = edge;
    }
    if (b[axis] < bounds.x || b[axis] > bounds.y) {
        float edge = clamp(b[axis], bounds.x, bounds.y);
        b = center + direction * (edge - center[axis]);
        b[axis] = edge;
    }
    return true;
}

void main(void) {
#pragma orderGuard

    float pixelSize = 1.0 / uDevicePixelRatio;

    // Stroke width in pixels
    float size = getScaled_size();
    float opacity = getScaled_opacity() * uViewOpacity;
    float outerSize = size + 2.0 * uOutlineWidth;
    if (uOutlineWidth > 0.0 && size <= 0.0) {
        gl_Position = vec4(100.0, 0.0, 0.0, 0.0);
        return;
    }

    // Compensate the complete footprint without fading a visible outline on a thin rule.
    if (outerSize < pixelSize) {
        opacity *= outerSize / pixelSize;
        size = outerSize > 0.0 ? size * pixelSize / outerSize : pixelSize;
        outerSize = pixelSize;
    }

    vec2 a = applyOffset(
        applySampleFacet(vec2(getScaled_x(), getScaled_y())),
        vec2(getScaled_xOffset(), getScaled_yOffset())
    );
    vec2 b = applyOffset(
        applySampleFacet(vec2(getScaled_x2(), getScaled_y2())),
        vec2(getScaled_x2Offset(), getScaled_y2Offset())
    );

    SampleFacetPosition facet = getSampleFacetPos();
    // Use the output viewport so clip:false can draw beyond the child view.
    vec2 lower = -uViewOffset / uViewScale;
    vec2 upper = (vec2(1.0) - uViewOffset) / uViewScale;
    // Keep artificial caps outside the viewport, including thick strokes.
    vec2 margin = max(upper - lower,
        vec2(outerSize + uMinLength + pixelSize) / uViewportSize);
    vec2 xBounds = vec2(lower.x - margin.x, upper.x + margin.x);
    vec2 yBounds = vec2(lower.y - margin.y, upper.y + margin.y);
#ifdef CLAMP_X
    xBounds = vec2(0.0, 1.0);
#endif
#ifdef CLAMP_Y
    yBounds = vec2(facet.pos, facet.pos + facet.height);
#endif
    if (!clipRuleAxis(a, b, 0, xBounds) || !clipRuleAxis(a, b, 1, yBounds) ||
        all(equal(a, b))) {
        gl_Position = vec4(100.0, 0.0, 0.0, 0.0);
        return;
    }

    vec2 tangent = b - a;

    float offset = 0.0;
    float relativeDiff = 0.0;
    if (uMinLength > 0.0 || uStrokeCap != BUTT) {
        float len = length(tangent * uViewportSize);

        // Elongate to reach the minimum length.
        // The length difference in pixels
        float diff = max(0.0, uMinLength - len);

        // Add line caps
        if (uStrokeCap != BUTT) {
            diff += outerSize;
        }

        relativeDiff = diff / len;
        offset = relativeDiff * (pos - 0.5);
    }

    // Apply caps and minimum length by spreading the vertices along the tangent
    vec2 p = pos < 1.0
        ? a + tangent * (pos + offset)
        : b + tangent * offset;

    // Add an extra pixel to stroke width to accommodate edge antialiasing
    float aaPadding = pixelSize;

    // Extrude
    vec2 normal = normalize(vec2(-tangent.y, tangent.x) / uViewportSize);
    p += normal * side * (outerSize + aaPadding) / uViewportSize;

    gl_Position = unitToNdc(p);

    vColor = premultiplyColor(getScaled_color(), opacity);
    vSize = size;
    vOuterSize = outerSize;
    vNormalLengthInPixels = side * (outerSize + aaPadding);

    vPosInPixels = vec2(pos, (1.0 - pos)) * (1.0 + relativeDiff) * length(tangent * uViewportSize) -
        vec2(uStrokeCap != BUTT ? outerSize / 2.0 : 0.0);
    
    setupPicking();
}
