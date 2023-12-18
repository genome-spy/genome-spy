const lowp vec4 white = vec4(1.0);
const lowp vec4 black = vec4(0.0, 0.0, 0.0, 1.0);

in float vRadius;
in float vRadiusWithPadding;

in lowp vec4 vFillColor;
in lowp vec4 vStrokeColor;
in lowp float vShape;
in lowp float vHalfStrokeWidth;

in mat2 vRotationMatrix;

out lowp vec4 fragColor;

// Copypaste from vertex shader
const float CIRCLE = 0.0;
const float SQUARE = 1.0;
const float CROSS = 2.0;
const float DIAMOND = 3.0;
const float TRIANGLE_UP = 4.0;
const float TICK_UP = 8.0;

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

float tickUp(vec2 p, float r) {
    float halfR = r * 0.5;
    p.y += halfR;
    p = abs(p);
    return max(p.x - r * 0.15, p.y - halfR);
}

float equilateralTriangle(vec2 p, float r) {
    p.y = -p.y;
    float k = sqrt(3.0);
    float kr = k * r;
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

    } else if (vShape == CROSS) {
        d = crossShape(p, r);

    } else if (vShape == DIAMOND) {
        d = diamond(p, r);

    } else if (vShape == TRIANGLE_UP) {
        d = equilateralTriangle(p, r);

    } else if (vShape == TICK_UP) {
        d = tickUp(p, r);

    } else {
        d = 0.0;
    }

	if (!uPickingEnabled) {
		lowp vec4 fillColor = mix(vFillColor, white, -d * uGradientStrength / vRadius);

		fragColor = distanceToColor(
			d + (uInwardStroke ? vHalfStrokeWidth : 0.0),
			fillColor,
			vStrokeColor,
			vHalfStrokeWidth);

	} else if (d - vHalfStrokeWidth <= 0.0) {
        fragColor = vPickingColor;

	} else {
		discard;
    }
}

