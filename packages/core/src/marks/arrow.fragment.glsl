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

float sdStem(vec2 p, vec2 halfSize, float rHeadSlope) {
    float notchLength = halfSize.y * rHeadSlope;
    vec2 vertices[6] = vec2[6](
        vec2(-halfSize.x, 0.0),
        vec2(-halfSize.x + notchLength, halfSize.y),
        vec2(halfSize.x, halfSize.y),
        vec2(halfSize.x - notchLength, 0.0),
        vec2(halfSize.x, -halfSize.y),
        vec2(-halfSize.x + notchLength, -halfSize.y)
    );

    return sdPolygon(vertices, p);
}

float arrowSize(float halfHeight, float rHeadSlope, float headWidth) {
    float headLength = halfHeight * rHeadSlope;
    return headLength + headWidth + vHalfStrokeWidth;
}

float sdArrowHead(vec2 p, float halfHeight, float rHeadSlope, float rHeadNotchSlope, float headWidth) {
    float headLength = halfHeight * rHeadSlope;
    float notchLength = halfHeight * rHeadNotchSlope;
    vec2 vertices[6] = vec2[6](
        vec2(0.0, 0.0),
        vec2(headLength, halfHeight),
        vec2(headLength + headWidth, halfHeight),
        vec2(headLength + headWidth - notchLength, 0.0),
        vec2(headLength + headWidth, -halfHeight),
        vec2(headLength, -halfHeight)
    );

    return sdPolygon(vertices, p);
}

float repeat(float x, float spacing) {
    return x >= spacing ? x - floor(x / spacing) * spacing : x;
}

float sdArrow(vec2 p, vec2 halfSize) {
    float headSlope = uHeadSlope;
    float rHeadSlope = 1.0 / headSlope;

    float spacing = uHeadRepeat
        ? max(uHeadSpacing, arrowSize(halfSize.y, rHeadSlope, 40.0))
        : 1.0 / 0.0;
    float arrowHeadX = repeat(vPosInPixels.x + halfSize.x, spacing);

    return min(
        sdStem(p, vec2(halfSize.x, halfSize.y * 0.2), rHeadSlope),
        sdArrowHead(vec2(arrowHeadX, vPosInPixels.y), halfSize.y, rHeadSlope, rHeadSlope, 40.0)
    );
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
