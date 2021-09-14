const lowp vec4 white = vec4(1.0);
const lowp vec4 black = vec4(0.0, 0.0, 0.0, 1.0);

flat in float vRadius;
flat in float vRadiusWithPadding;

flat in lowp vec4 vFillColor;
flat in lowp vec4 vStrokeColor;
flat in lowp float vShape;
flat in lowp float vHalfStrokeWidth;
flat in lowp float vGradientStrength;

flat in mat2 vRotationMatrix;

out lowp vec4 fragColor;

const float CIRCLE = 0.0;
const float SQUARE = 1.0;
const float TRIANGLE_UP = 2.0;
const float CROSS = 3.0;
const float DIAMOND = 4.0;
const float TRIANGLE_DOWN = 5.0;
const float TRIANGLE_RIGHT = 6.0;
const float TRIANGLE_LEFT = 7.0;


// The distance functions are inspired by:
// http://www.iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm
// However, these are not true distance functions, because the corners need to be sharp.

float circle(vec2 p, float r) {
    return length(p) - r;
}

float square(vec2 p, float r) {
    p = abs(p);
    return max(p.x, p.y) - r;
}

float equilateralTriangle(vec2 p, float r, bool flip, bool swap) {
    if (swap) {
        p.xy = p.yx;
    }
    if (flip) {
        p.y = -p.y;
    }

    float k = sqrt(3.0);
    float kr = k * r;
    //p.y -= kr * 2.0 / 3.0;
    p.y -= kr / 2.0;
    return max((abs(p.x) * k + p.y) / 2.0, -p.y - kr);
}

float crossShape(vec2 p, float r) {
    p = abs(p);

	vec2 b = vec2(0.4, 1.0) * r;
    vec2 v = abs(p) - b.xy;
    vec2 h = abs(p) - b.yx;
    return min(max(v.x, v.y), max(h.x, h.y));
}

float diamond(vec2 p, float r) {
    p = abs(p);
    return (max(abs(p.x - p.y), abs(p.x + p.y)) - r) / sqrt(2.0);
}

void main() {
    float d;

	/** Normalized point coord */
    vec2 p = vRotationMatrix * (2.0 * gl_PointCoord - 1.0) * vRadiusWithPadding;
	float r = vRadius;

    // We could also use textures here. Could even be faster, because we have plenty of branching here.
    if (vShape == CIRCLE) {
        d = circle(p, r);

    } else if (vShape == SQUARE) {
        d = square(p, r);

    } else if (vShape == TRIANGLE_UP) {
        d = equilateralTriangle(p, r, true, false);

    } else if (vShape == CROSS) {
        d = crossShape(p, r);

    } else if (vShape == DIAMOND) {
        d = diamond(p, r);

    } else if (vShape == TRIANGLE_DOWN) {
        d = equilateralTriangle(p, r, false, false);

    } else if (vShape == TRIANGLE_RIGHT) {
        d = equilateralTriangle(p, r, false, true);

    } else if (vShape == TRIANGLE_LEFT) {
        d = equilateralTriangle(p, r, true, true);

    } else {
        d = 0.0;
    }

	if (!uPickingEnabled) {
		// TODO: Stuble radial gradient
		lowp vec4 fillColor = vFillColor; //mix(vColor, white, -d * vGradientStrength);

		fragColor = distanceToColor(d, fillColor, vStrokeColor, vHalfStrokeWidth);

	} else if (d - vHalfStrokeWidth <= 0.0) {
        fragColor = vPickingColor;

	} else {
		discard;
    }
}

