in vec2 vPosInPixels;

flat in vec2 vHalfSizeInPixels;
flat in lowp vec4 vFillColor;
flat in lowp vec4 vStrokeColor;
flat in float vHalfStrokeWidth;

out lowp vec4 fragColor;

const int N = 6;

// Adapted from: https://iquilezles.org/articles/distfunctions2d/
float sdPolygon(vec2[N] v, vec2 p) {
    float d = dot(p-v[0],p-v[0]);
    float s = 1.0;
    for( int i=0, j=N-1; i<N; j=i, i++ ) {
        vec2 e = v[j] - v[i];
        vec2 w =    p - v[i];
        vec2 b = w - e*clamp( dot(w,e)/dot(e,e), 0.0, 1.0 );
        d = min( d, dot(b,b) );
        bvec3 c = bvec3(p.y>=v[i].y,p.y<v[j].y,e.x*w.y>e.y*w.x);
        if( all(c) || all(not(c)) ) s*=-1.0;  
    }
    return s*sqrt(d);
}

float sdStem(
    vec2 p,
    float halfLength,
    float halfWidth,
    float rHeadSlope
) {
    float notchLength = halfWidth * rHeadSlope;
    vec2 vertices[6] = vec2[6](
        vec2(-halfLength, 0.0),
        vec2(-halfLength + notchLength, halfWidth),
        vec2(halfLength, halfWidth),
        vec2(halfLength - notchLength, 0.0),
        vec2(halfLength, -halfWidth),
        vec2(-halfLength + notchLength, -halfWidth)
    );

    return sdPolygon(vertices, p);
}

float headFootprintLength(float halfWidth, float rHeadSlope, float headStrokeWidth) {
    float headLength = halfWidth * rHeadSlope;
    float headStrokeLength = headStrokeWidth / length(vec2(rHeadSlope, 1.0));
    return headLength + headStrokeLength + vHalfStrokeWidth;
}

float sdArrowHead(
    vec2 p,
    float halfWidth,
    float rHeadSlope,
    float rHeadNotchSlope,
    float headStrokeWidth
) {
    float headLength = halfWidth * rHeadSlope;
    vec2 topOuter = vec2(headLength, halfWidth);
    vec2 bottomOuter = vec2(headLength, -halfWidth);
    vec2 normalOffset = headStrokeWidth * normalize(vec2(halfWidth, -headLength));
    vec2 topInner = topOuter + normalOffset;
    vec2 bottomInner = bottomOuter + vec2(normalOffset.x, -normalOffset.y);
    float notchX = topInner.x - topInner.y * rHeadNotchSlope;

    vec2 vertices[6] = vec2[6](
        vec2(0.0, 0.0),
        topOuter,
        topInner,
        vec2(notchX, 0.0),
        bottomInner,
        bottomOuter
    );

    return sdPolygon(vertices, p);
}

float repeat(float x, float spacing) {
    return x >= spacing ? x - floor(x / spacing) * spacing : x;
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

// Arrow-space convention: x is length along the arrow body, y is width
// perpendicular to it. Negative x points toward the arrowhead in the canonical
// "reverse" direction. Shared varyings keep the rect mark names.
vec2 toArrowSpace(vec2 v) {
    return uOrient == ORIENT_HORIZONTAL ? v : v.yx;
}

float sdArrow(vec2 arrowPos, vec2 arrowHalfSize) {
    float rHeadSlope = 1.0 / uHeadSlope;
    float rHeadNotchSlope = min(1.0 / uHeadNotchSlope, rHeadSlope);
    float stemHalfWidth = resolveStemHalfWidth(arrowHalfSize.y);
    float headStrokeWidth = uHeadShape == HEAD_SHAPE_ANGLE
        ? stemHalfWidth * 2.0
        : 0.0;

    float spacing = uHeadRepeat
        ? max(
            uHeadSpacing,
            headFootprintLength(arrowHalfSize.y, rHeadSlope, headStrokeWidth)
        )
        : 1.0 / 0.0;
    float distanceFromStart = arrowPos.x + arrowHalfSize.x;
    float arrowHeadX = repeat(distanceFromStart, spacing);

    return min(
        sdStem(arrowPos, arrowHalfSize.x, stemHalfWidth, rHeadSlope),
        sdArrowHead(
            vec2(arrowHeadX, arrowPos.y),
            arrowHalfSize.y,
            rHeadSlope,
            rHeadNotchSlope,
            headStrokeWidth
        )
    );
}

void main(void) {
    vec2 arrowPos = toArrowSpace(vPosInPixels);
    vec2 arrowHalfSize = toArrowSpace(vHalfSizeInPixels);
    if (uDirection == DIRECTION_FORWARD) {
        arrowPos.x = -arrowPos.x;
    }
    float d = sdArrow(arrowPos, arrowHalfSize);

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
