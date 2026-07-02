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

float sdNotchedFilledArrow(
    vec2 p,
    float left,
    float right,
    bool drawStartHead,
    bool drawEndHead,
    float headLength,
    float headHalfWidth,
    float stemHalfWidth,
    float headNotchDepth
) {
    bool startHead =
        drawStartHead && headLength > 0.0 && headHalfWidth > 0.0;
    bool endHead = drawEndHead && headLength > 0.0 && headHalfWidth > 0.0;

    if (!startHead && !endHead) {
        if (stemHalfWidth <= 0.0) {
            return 1e20;
        }

        vec2 center = vec2((left + right) * 0.5, 0.0);
        vec2 halfSize = vec2((right - left) * 0.5, stemHalfWidth);
        return sdSharpBox(p - center, halfSize);
    }

    float startBase = startHead ? left + headLength : left;
    float endBase = endHead ? right - headLength : right;
    float startNotch = mix(startBase, left, headNotchDepth);
    float endNotch = mix(endBase, right, headNotchDepth);

    vec2 first = startHead ? vec2(left, 0.0) : vec2(left, stemHalfWidth);
    vec2 previous = first;
    float squaredDistance = 1e20;
    bool inside = false;

    if (startHead) {
        addPolygonVertex(
            p,
            vec2(startBase, headHalfWidth),
            previous,
            squaredDistance,
            inside
        );
        addPolygonVertex(
            p,
            vec2(startNotch, stemHalfWidth),
            previous,
            squaredDistance,
            inside
        );
    }

    addPolygonVertex(
        p,
        vec2(endNotch, stemHalfWidth),
        previous,
        squaredDistance,
        inside
    );

    if (endHead) {
        addPolygonVertex(
            p,
            vec2(endBase, headHalfWidth),
            previous,
            squaredDistance,
            inside
        );
        addPolygonVertex(
            p,
            vec2(right, 0.0),
            previous,
            squaredDistance,
            inside
        );
        addPolygonVertex(
            p,
            vec2(endBase, -headHalfWidth),
            previous,
            squaredDistance,
            inside
        );
        addPolygonVertex(
            p,
            vec2(endNotch, -stemHalfWidth),
            previous,
            squaredDistance,
            inside
        );
    } else {
        addPolygonVertex(
            p,
            vec2(right, -stemHalfWidth),
            previous,
            squaredDistance,
            inside
        );
    }

    if (startHead) {
        addPolygonVertex(
            p,
            vec2(startNotch, -stemHalfWidth),
            previous,
            squaredDistance,
            inside
        );
        addPolygonVertex(
            p,
            vec2(startBase, -headHalfWidth),
            previous,
            squaredDistance,
            inside
        );
    } else {
        addPolygonVertex(
            p,
            vec2(left, -stemHalfWidth),
            previous,
            squaredDistance,
            inside
        );
    }

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

bool hasEndHead() {
    return uHeads == HEADS_END || uHeads == HEADS_BOTH;
}

bool hasStartHead() {
    return uHeads == HEADS_START || uHeads == HEADS_BOTH;
}

float sdConfiguredHead(
    vec2 p,
    float tipX,
    float baseX,
    float halfWidth,
    float halfLineWidth
) {
    return sdAngleHead(p, tipX, baseX, halfWidth, halfLineWidth);
}

float stemHeadOverlap(float headLength) {
    return min(headLength, vHalfStrokeWidth + 1.0 / uDevicePixelRatio);
}

float stemStartForHead(
    bool drawHead,
    float edge,
    float headInset,
    float overlap
) {
    if (!drawHead || uHeadShape == HEAD_SHAPE_ANGLE) {
        return edge;
    } else {
        return edge + max(headInset - overlap, 0.0);
    }
}

float stemEndForHead(
    bool drawHead,
    float edge,
    float headInset,
    float overlap
) {
    if (!drawHead || uHeadShape == HEAD_SHAPE_ANGLE) {
        return edge;
    } else {
        return edge - max(headInset - overlap, 0.0);
    }
}

float sdArrow(vec2 p, vec2 halfSize) {
    vec2 q = p;
    vec2 b = halfSize;

    if (uOrient == ORIENT_VERTICAL) {
        q = q.yx;
        b = b.yx;
    }
    if (uDirection == DIRECTION_REVERSE) {
        q.x = -q.x;
    }

    float shapeInset = uHeadPlacement == HEAD_PLACEMENT_INSIDE
        ? vHalfStrokeWidth
        : 0.0;
    b = max(b - vec2(shapeInset, 0.0), vec2(0.0));

    float arrowLength = b.x * 2.0;
    float thickness = b.y * 2.0;
    if (arrowLength <= 0.0 || thickness <= 0.0) {
        return 1.0;
    }

    bool drawEndHead = hasEndHead();
    bool drawStartHead = hasStartHead();
    float headCount =
        (drawEndHead ? 1.0 : 0.0) + (drawStartHead ? 1.0 : 0.0);

    float headLength = unitValue(uHeadLength, uHeadLengthUnit, thickness);
    float maxHeadLength = headCount > 0.0 ? arrowLength / headCount : 0.0;
    bool squeezeHead = uHeadPlacement == HEAD_PLACEMENT_INSIDE;
    bool shortForHeads =
        squeezeHead && headCount > 0.0 && headLength > maxHeadLength;
    if (shortForHeads && uShortArrow == SHORT_ARROW_HIDE) {
        return 1.0;
    }
    if (headCount == 0.0) {
        headLength = 0.0;
    } else if (squeezeHead) {
        headLength = min(max(headLength, 0.0), maxHeadLength);
    } else {
        headLength = max(headLength, 0.0);
    }

    float headHalfWidth =
        unitValue(uHeadWidth, uHeadWidthUnit, thickness) * 0.5;
    headHalfWidth = clamp(headHalfWidth, 0.0, b.y);

    float stemHalfWidth =
        unitValue(uStemWidth, uStemWidthUnit, thickness) * 0.5;
    stemHalfWidth = clamp(stemHalfWidth, 0.0, b.y);
    if (shortForHeads && uShortArrow == SHORT_ARROW_TRIANGLE) {
        stemHalfWidth = 0.0;
    }

    if (uHeadShape == HEAD_SHAPE_TRIANGLE) {
        float headNotchDepth = clamp(uHeadNotch, 0.0, 0.95);
        return sdNotchedFilledArrow(
            q,
            -b.x,
            b.x,
            drawStartHead,
            drawEndHead,
            headLength,
            headHalfWidth,
            stemHalfWidth,
            headNotchDepth
        );
    }

    float startInset = drawStartHead ? headLength : 0.0;
    float endInset = drawEndHead ? headLength : 0.0;
    float overlap = stemHeadOverlap(headLength);
    float stemLeft = stemStartForHead(drawStartHead, -b.x, startInset, overlap);
    float stemRight = stemEndForHead(drawEndHead, b.x, endInset, overlap);

    float d = 1e20;

    if (stemRight >= stemLeft && stemHalfWidth > 0.0) {
        vec2 stemCenter = vec2((stemLeft + stemRight) * 0.5, 0.0);
        vec2 stemHalfSize = vec2((stemRight - stemLeft) * 0.5, stemHalfWidth);
        d = min(d, sdSharpBox(q - stemCenter, stemHalfSize));
    }

    if (drawEndHead && headLength > 0.0 && headHalfWidth > 0.0) {
        d = min(
            d,
            sdConfiguredHead(
                q,
                b.x,
                b.x - headLength,
                headHalfWidth,
                max(stemHalfWidth, 0.5)
            )
        );
    }
    if (drawStartHead && headLength > 0.0 && headHalfWidth > 0.0) {
        vec2 startHeadPoint = vec2(-q.x, q.y);
        d = min(
            d,
            sdConfiguredHead(
                startHeadPoint,
                b.x,
                b.x - headLength,
                headHalfWidth,
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
