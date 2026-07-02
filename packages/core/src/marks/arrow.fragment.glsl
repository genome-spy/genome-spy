in vec2 vPosInPixels;

flat in vec2 vHalfSizeInPixels;
flat in lowp vec4 vFillColor;
flat in lowp vec4 vStrokeColor;
flat in float vHalfStrokeWidth;

out lowp vec4 fragColor;

const int ORIENT_HORIZONTAL = 0;
const int ORIENT_VERTICAL = 1;

const int DIRECTION_FORWARD = 0;
const int DIRECTION_REVERSE = 1;

const int HEADS_END = 0;
const int HEADS_START = 1;
const int HEADS_BOTH = 2;
const int HEADS_NONE = 3;

const int HEAD_SHAPE_TRIANGLE = 0;
const int HEAD_SHAPE_ANGLE = 1;
const int HEAD_SHAPE_STEALTH = 2;

const int UNIT_PX = 0;
const int UNIT_PROPORTION = 1;

const int SHORT_ARROW_SHRINK_HEAD = 0;
const int SHORT_ARROW_TRIANGLE = 1;
const int SHORT_ARROW_HIDE = 2;

const int ENDPOINT_MODE_INSIDE = 0;
const int ENDPOINT_MODE_TIP = 1;

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

float edgeSide(vec2 p, vec2 a, vec2 b) {
    vec2 ba = b - a;
    vec2 pa = p - a;
    return ba.x * pa.y - ba.y * pa.x;
}

float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
    float d = min(
        segmentDistance(p, a, b),
        min(segmentDistance(p, b, c), segmentDistance(p, c, a))
    );

    float ab = edgeSide(p, a, b);
    float bc = edgeSide(p, b, c);
    float ca = edgeSide(p, c, a);
    bool inside = (ab <= 0.0 && bc <= 0.0 && ca <= 0.0) ||
        (ab >= 0.0 && bc >= 0.0 && ca >= 0.0);

    return inside ? -d : d;
}

float sdTriangleHead(vec2 p, float tipX, float baseX, float halfWidth) {
    return sdTriangle(
        p,
        vec2(tipX, 0.0),
        vec2(baseX, halfWidth),
        vec2(baseX, -halfWidth)
    );
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

float sdStealthHead(vec2 p, float tipX, float baseX, float halfWidth) {
    float notchX = mix(baseX, tipX, 0.28);
    vec2 tip = vec2(tipX, 0.0);
    vec2 notch = vec2(notchX, 0.0);

    return min(
        sdTriangle(p, tip, vec2(baseX, halfWidth), notch),
        sdTriangle(p, tip, notch, vec2(baseX, -halfWidth))
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

float sdConfiguredHead(
    vec2 p,
    float tipX,
    float baseX,
    float halfWidth,
    float halfLineWidth
) {
    if (uHeadShape == HEAD_SHAPE_ANGLE) {
        return sdAngleHead(p, tipX, baseX, halfWidth, halfLineWidth);
    } else if (uHeadShape == HEAD_SHAPE_STEALTH) {
        return sdStealthHead(p, tipX, baseX, halfWidth);
    } else {
        return sdTriangleHead(p, tipX, baseX, halfWidth);
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

    float endpointInset = uEndpointMode == ENDPOINT_MODE_INSIDE
        ? vHalfStrokeWidth
        : 0.0;
    b = max(b - vec2(endpointInset, 0.0), vec2(0.0));

    float arrowLength = b.x * 2.0;
    float thickness = b.y * 2.0;
    if (arrowLength <= 0.0 || thickness <= 0.0) {
        return 1.0;
    }

    bool drawEndHead = hasEndHead();
    bool drawStartHead = hasStartHead();
    float headCount =
        (drawEndHead ? 1.0 : 0.0) + (drawStartHead ? 1.0 : 0.0);

    float headLength = unitValue(uHeadLength, uHeadLengthUnit, arrowLength);
    float maxHeadLength = headCount > 0.0 ? arrowLength / headCount : 0.0;
    bool shortForHeads = headCount > 0.0 && headLength > maxHeadLength;
    if (shortForHeads && uShortArrow == SHORT_ARROW_HIDE) {
        return 1.0;
    }
    if (headCount == 0.0) {
        headLength = 0.0;
    } else {
        headLength = min(max(headLength, 0.0), maxHeadLength);
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

    float startInset = drawStartHead ? headLength : 0.0;
    float endInset = drawEndHead ? headLength : 0.0;
    float stemLeft = -b.x + startInset;
    float stemRight = b.x - endInset;

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
