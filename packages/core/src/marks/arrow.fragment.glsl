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
    float rHeadSlope,
    float rStartNotchSlope
) {
    float headSideLength = halfWidth * rHeadSlope;
    float startNotchLength = halfWidth * rStartNotchSlope;
    vec2 vertices[6] = vec2[6](
        vec2(-halfLength, 0.0),
        vec2(-halfLength + headSideLength, halfWidth),
        vec2(halfLength, halfWidth),
        vec2(halfLength - startNotchLength, 0.0),
        vec2(halfLength, -halfWidth),
        vec2(-halfLength + headSideLength, -halfWidth)
    );

    return sdPolygon(vertices, p);
}

float headFootprintLength(float halfWidth, float rHeadSlope, float headStrokeWidth) {
    float headLength = halfWidth * rHeadSlope;
    float headStrokeLength = headStrokeWidth / length(vec2(rHeadSlope, 1.0));
    return headLength + headStrokeLength + vHalfStrokeWidth;
}

// Inner corner of an open angle head, offset perpendicular to the outer edge.
vec2 headInnerCorner(float halfWidth, float rHeadSlope, float headStrokeWidth) {
    float headLength = halfWidth * rHeadSlope;
    vec2 topOuter = vec2(headLength, halfWidth);
    vec2 normalOffset = headStrokeWidth * normalize(vec2(halfWidth, -headLength));
    return topOuter + normalOffset;
}

// X coordinate where the arrowhead notch edge crosses the centerline.
float headNotchX(
    float halfWidth,
    float rHeadSlope,
    float rHeadNotchSlope,
    float headStrokeWidth
) {
    vec2 topInner = headInnerCorner(halfWidth, rHeadSlope, headStrokeWidth);
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
    vec2 topInner = headInnerCorner(halfWidth, rHeadSlope, headStrokeWidth);
    vec2 normalOffset = topInner - topOuter;
    vec2 bottomInner = bottomOuter + vec2(normalOffset.x, -normalOffset.y);
    float notchX = headNotchX(
        halfWidth,
        rHeadSlope,
        rHeadNotchSlope,
        headStrokeWidth
    );

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
    float configuredRHeadSlope = 1.0 / uHeadSlope;
    float configuredRHeadNotchSlope = 1.0 / uHeadNotchSlope;
    float stemHalfWidth = resolveStemHalfWidth(arrowHalfSize.y);
    float headStrokeWidth = uHeadShape == HEAD_SHAPE_ANGLE
        ? stemHalfWidth * 2.0
        : 0.0;
    float rHeadSlope = effectiveHeadSlope(
        arrowHalfSize.x,
        arrowHalfSize.y,
        stemHalfWidth,
        configuredRHeadSlope,
        configuredRHeadNotchSlope
    );
    float rHeadNotchSlope = min(configuredRHeadNotchSlope, rHeadSlope);
    float rStartNotchSlope = uStartNotch ? rHeadSlope : 0.0;

    float spacing = uHeadRepeat
        ? max(
            uHeadSpacing,
            headFootprintLength(arrowHalfSize.y, rHeadSlope, headStrokeWidth)
        )
        : 1.0 / 0.0;
    float distanceFromStart = arrowPos.x + arrowHalfSize.x;
    float arrowHeadX = repeat(distanceFromStart, spacing);

    return min(
        sdStem(
            arrowPos,
            arrowHalfSize.x,
            stemHalfWidth,
            rHeadSlope,
            rStartNotchSlope
        ),
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
