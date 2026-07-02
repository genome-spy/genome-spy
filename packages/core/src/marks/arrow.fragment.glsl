in vec2 vPosInPixels;

flat in vec2 vHalfSizeInPixels;
flat in lowp vec4 vFillColor;
flat in lowp vec4 vStrokeColor;
flat in float vHalfStrokeWidth;

out lowp vec4 fragColor;

float sdSharpBox(vec2 p, vec2 b) {
    vec2 q = abs(p) - b;
    return max(q.x, q.y);
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

// Polygon SDF helpers: track closest edge distance and winding state in one pass.
void addPolygonEdge(
    vec2 p,
    vec2 a,
    vec2 b,
    inout float squaredDistance,
    inout bool inside
) {
    vec2 edge = b - a;
    vec2 pa = p - a;
    float edgeSquaredLength = max(dot(edge, edge), 1e-6);
    vec2 closest =
        pa - edge * clamp(dot(pa, edge) / edgeSquaredLength, 0.0, 1.0);
    squaredDistance = min(squaredDistance, dot(closest, closest));

    bool crosses =
        (a.y > p.y && b.y <= p.y) || (b.y > p.y && a.y <= p.y);
    if (crosses) {
        float x = a.x + (p.y - a.y) * edge.x / edge.y;
        if (p.x < x) {
            inside = !inside;
        }
    }
}

void addPolygonVertex(
    vec2 p,
    vec2 vertex,
    inout vec2 previous,
    inout float squaredDistance,
    inout bool inside
) {
    addPolygonEdge(p, previous, vertex, squaredDistance, inside);
    previous = vertex;
}

float sdPolygonDistance(float squaredDistance, bool inside) {
    return (inside ? -1.0 : 1.0) * sqrt(squaredDistance);
}

// Stem body with an optional V-notch at the tail.
float sdArrowStem(
    vec2 p,
    float left,
    float right,
    float stemHalfWidth,
    float startNotchLength
) {
    bool startNotch = startNotchLength > 0.0 && stemHalfWidth > 0.0;

    if (stemHalfWidth <= 0.0 || right <= left) {
        return 1e20;
    }

    if (!startNotch) {
        vec2 center = vec2((left + right) * 0.5, 0.0);
        vec2 halfSize = vec2((right - left) * 0.5, stemHalfWidth);
        return sdSharpBox(p - center, halfSize);
    }

    float startNotchX = left + startNotchLength;

    vec2 first = vec2(left, stemHalfWidth);
    vec2 previous = first;
    float squaredDistance = 1e20;
    bool inside = false;

    addPolygonVertex(
        p,
        vec2(right, stemHalfWidth),
        previous,
        squaredDistance,
        inside
    );
    addPolygonVertex(
        p,
        vec2(right, -stemHalfWidth),
        previous,
        squaredDistance,
        inside
    );
    addPolygonVertex(
        p,
        vec2(left, -stemHalfWidth),
        previous,
        squaredDistance,
        inside
    );
    addPolygonVertex(
        p,
        vec2(startNotchX, 0.0),
        previous,
        squaredDistance,
        inside
    );
    addPolygonVertex(p, first, previous, squaredDistance, inside);

    return sdPolygonDistance(squaredDistance, inside);
}

// Filled arrowhead. `headNotchDepth` moves the stem/head join toward the tip.
float sdFilledArrowHead(
    vec2 p,
    float tipX,
    float headLength,
    float headHalfWidth,
    float stemHalfWidth,
    float headNotchDepth
) {
    if (headLength <= 0.0 || headHalfWidth <= 0.0) {
        return 1e20;
    }

    float baseX = tipX - headLength;
    float notchX = mix(baseX, tipX, headNotchDepth);

    vec2 first = vec2(notchX, stemHalfWidth);
    vec2 previous = first;
    float squaredDistance = 1e20;
    bool inside = false;

    addPolygonVertex(
        p,
        vec2(baseX, headHalfWidth),
        previous,
        squaredDistance,
        inside
    );
    addPolygonVertex(
        p,
        vec2(tipX, 0.0),
        previous,
        squaredDistance,
        inside
    );
    addPolygonVertex(
        p,
        vec2(baseX, -headHalfWidth),
        previous,
        squaredDistance,
        inside
    );
    addPolygonVertex(
        p,
        vec2(notchX, -stemHalfWidth),
        previous,
        squaredDistance,
        inside
    );
    addPolygonVertex(p, first, previous, squaredDistance, inside);

    return sdPolygonDistance(squaredDistance, inside);
}

float sdAngleHead(
    vec2 p,
    float tipX,
    float baseX,
    float halfWidth,
    float halfLineWidth
) {
    vec2 tip = vec2(tipX, 0.0);
    float d = min(
        segmentDistance(p, tip, vec2(baseX, halfWidth)),
        segmentDistance(p, tip, vec2(baseX, -halfWidth))
    );
    return d - halfLineWidth;
}

float unitValue(float value, int unit, float reference) {
    if (unit == UNIT_PROPORTION) {
        return value * reference;
    } else {
        return value;
    }
}

// Dispatch the configured head shape while keeping placement logic shared.
float sdArrowHead(
    vec2 p,
    float tipX,
    float headLength,
    float halfWidth,
    float stemHalfWidth,
    float headNotchDepth,
    float halfLineWidth
) {
    if (uHeadShape == HEAD_SHAPE_TRIANGLE) {
        return sdFilledArrowHead(
            p,
            tipX,
            headLength,
            halfWidth,
            stemHalfWidth,
            headNotchDepth
        );
    } else {
        return sdAngleHead(
            p,
            tipX,
            tipX - headLength,
            halfWidth,
            halfLineWidth
        );
    }
}

// Draw the anchored head and optional repeated heads behind it.
float sdArrowHeads(
    vec2 p,
    float anchorTipX,
    float repeatLeft,
    float repeatRight,
    float headLength,
    float headHalfWidth,
    float stemHalfWidth,
    float headNotchDepth,
    float halfLineWidth
) {
    if (headLength <= 0.0 || headHalfWidth <= 0.0) {
        return 1e20;
    }

    float d = sdArrowHead(
        p,
        anchorTipX,
        headLength,
        headHalfWidth,
        stemHalfWidth,
        headNotchDepth,
        halfLineWidth
    );

    if (!uHeadRepeat || repeatRight <= repeatLeft) {
        return d;
    }

    float spacing = max(uHeadSpacing, 1.0);
    float offset = mod(uHeadOffset, spacing);
    float repeatX = anchorTipX - offset - p.x;
    float cellX = mod(repeatX, spacing);
    float previousTipX = p.x + cellX;
    float nextTipX = previousTipX - spacing;

    if (previousTipX >= repeatLeft && previousTipX <= repeatRight) {
        d = min(
            d,
            sdArrowHead(
                p,
                previousTipX,
                headLength,
                headHalfWidth,
                stemHalfWidth,
                headNotchDepth,
                halfLineWidth
            )
        );
    }
    if (nextTipX >= repeatLeft && nextTipX <= repeatRight) {
        d = min(
            d,
            sdArrowHead(
                p,
                nextTipX,
                headLength,
                headHalfWidth,
                stemHalfWidth,
                headNotchDepth,
                halfLineWidth
            )
        );
    }

    return d;
}

// The stem ends at the anchor head's stem-facing join.
float stemEndForHeadTip(
    float tipX,
    float headLength,
    float headNotchDepth
) {
    if (uHeadShape == HEAD_SHAPE_ANGLE) {
        return tipX;
    } else {
        float headBaseX = tipX - headLength;
        float notchX = mix(headBaseX, tipX, headNotchDepth);
        return notchX;
    }
}

float sdArrow(vec2 p, vec2 halfSize) {
    vec2 q = p;
    vec2 b = halfSize;

    // Normalize to a left-to-right horizontal arrow before evaluating SDFs.
    if (uOrient == ORIENT_VERTICAL) {
        q = q.yx;
        b = b.yx;
    }
    if (uDirection == DIRECTION_REVERSE) {
        q.x = -q.x;
    }

    // Inside placement keeps the final visible shape within the encoded interval.
    float shapeInset = uHeadPlacement == HEAD_PLACEMENT_INSIDE
        ? vHalfStrokeWidth
        : 0.0;
    b = max(b - vec2(shapeInset, 0.0), vec2(0.0));

    float arrowLength = b.x * 2.0;
    float thickness = b.y * 2.0;
    if (arrowLength <= 0.0 || thickness <= 0.0) {
        return 1.0;
    }

    float headLength = max(
        unitValue(uHeadLength, uHeadLengthUnit, thickness),
        0.0
    );
    float headHalfWidth =
        unitValue(uHeadWidth, uHeadWidthUnit, thickness) * 0.5;
    headHalfWidth = clamp(headHalfWidth, 0.0, b.y);

    float stemHalfWidth =
        unitValue(uStemWidth, uStemWidthUnit, thickness) * 0.5;
    stemHalfWidth = clamp(stemHalfWidth, 0.0, b.y);

    float maxHeadLength = arrowLength;
    bool squeezeHead = uHeadPlacement == HEAD_PLACEMENT_INSIDE;
    bool shortForHeads = squeezeHead && headLength > maxHeadLength;
    if (shortForHeads && uShortArrow == SHORT_ARROW_HIDE) {
        return 1.0;
    }
    if (squeezeHead) {
        headLength = min(headLength, maxHeadLength);
    }

    if (shortForHeads && uShortArrow == SHORT_ARROW_TRIANGLE) {
        stemHalfWidth = 0.0;
    }

    // Reduce the filled-head notch for squeezed arrows so short marks stay sane.
    float headNotchDepth = clamp(uHeadNotch, 0.0, 0.95);
    float stemLength = max(arrowLength - headLength, 0.0);
    if (uHeadShape == HEAD_SHAPE_TRIANGLE) {
        if (squeezeHead) {
            float notchScale = headLength > 0.0
                ? clamp(stemLength / headLength, 0.0, 1.0)
                : 0.0;
            headNotchDepth *= notchScale;
        }
    }

    float anchorTipX = b.x;
    float stemLeft = -b.x;
    float stemRight = b.x;

    // Clip the stem at the anchored head so the head notch remains visible.
    if (headLength > 0.0) {
        stemRight = stemEndForHeadTip(
            anchorTipX,
            headLength,
            headNotchDepth
        );
    }

    float startNotchLength = min(
        clamp(uStartNotch, 0.0, 1.0) * thickness,
        max(stemRight - stemLeft, 0.0)
    );

    float d = 1e20;

    if (stemRight >= stemLeft && stemHalfWidth > 0.0) {
        d = min(
            d,
            sdArrowStem(
                q,
                stemLeft,
                stemRight,
                stemHalfWidth,
                startNotchLength
            )
        );
    }

    if (headLength > 0.0 && headHalfWidth > 0.0) {
        // Repeated heads are placed backward from the anchor head.
        float repeatRight = uHeadRepeatMode == HEAD_REPEAT_MODE_BODY
            ? stemRight
            : anchorTipX;
        d = min(
            d,
            sdArrowHeads(
                q,
                anchorTipX,
                stemLeft,
                repeatRight,
                headLength,
                headHalfWidth,
                stemHalfWidth,
                headNotchDepth,
                max(stemHalfWidth, 0.5)
            )
        );
    }

    return d;
}

void main(void) {
    float d = sdArrow(vPosInPixels, vHalfSizeInPixels);

    fragColor = distanceToColor(
        d,
        vFillColor,
        vStrokeColor,
        vec4(0.0),
        vHalfStrokeWidth
    );

    if (uPickingEnabled) {
        if (d < vHalfStrokeWidth) {
            fragColor = vPickingColor;
        }
    } else if (fragColor.a == 0.0) {
        discard;
    }
}
