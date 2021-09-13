const lowp vec3 white = vec3(1.0);
const lowp vec3 black = vec3(0.0);

flat in lowp vec4 vColor;
flat in float vSize;
flat in lowp float vShape;
flat in lowp float vStrokeWidth;
flat in lowp float vGradientStrength;

out lowp vec4 fragColor;

const float CIRCLE = 0.0;
const float SQUARE = 1.0;
const float TRIANGLE_UP = 2.0;
const float CROSS = 3.0;
const float DIAMOND = 4.0;
const float TRIANGLE_DOWN = 5.0;
const float TRIANGLE_RIGHT = 6.0;
const float TRIANGLE_LEFT = 7.0;

/** Normalized point coord */
vec2 npc() {
    return gl_PointCoord * 2.0 - 1.0;
}

// The distance functions are partially based on:
// http://www.iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm
// However, these are not true distance functions, because the corners need to be sharp.

float circle() {
    return length(npc()) - 1.0;
}

float square() {
    vec2 pos = abs(npc());
    return max(pos.x, pos.y) - 1.0;
}

float equilateralTriangle(bool flip, bool swap) {
    vec2 p = npc();
    if (swap) {
        p.xy = p.yx;
    }
    if (flip) {
        p.y = -p.y;
    }

    float r = 1.0;
    float k = sqrt(3.0);
    float kr = k * r;
    //p.y -= kr * 2.0 / 3.0;
    p.y -= kr / 2.0;
    return max((abs(p.x) * k + p.y) / 2.0, -p.y - kr);
}

float crossShape() {
	float r = 1.0;
    vec2 p = abs(npc());

	vec2 b = vec2(0.4, 1.0) * r;
    vec2 v = abs(p) - b.xy;
    vec2 h = abs(p) - b.yx;
    return min(max(v.x, v.y), max(h.x, h.y));
}

float diamond() {
	float r = 1.0;
    vec2 p = abs(npc());
    return (max(abs(p.x - p.y), abs(p.x + p.y)) - r) / sqrt(2.0);
}

void main() {
    float dist;
    
    // We could also use textures here. Could even be faster, because we have plenty of branching here.
    if (vShape == CIRCLE) {
        dist = circle();

    } else if (vShape == SQUARE) {
        dist = square();

    } else if (vShape == TRIANGLE_UP) {
        dist = equilateralTriangle(true, false);

    } else if (vShape == CROSS) {
        dist = crossShape();

    } else if (vShape == DIAMOND) {
        dist = diamond();

    } else if (vShape == TRIANGLE_DOWN) {
        dist = equilateralTriangle(false, false);

    } else if (vShape == TRIANGLE_RIGHT) {
        dist = equilateralTriangle(false, true);

    } else if (vShape == TRIANGLE_LEFT) {
        dist = equilateralTriangle(true, true);

    } else {
        dist = 0.0;
    }

    if (dist > 0.3)
        discard;

    lowp vec3 strokeColor = mix(vColor.rgb, black, 0.3); 
    // Stuble radial gradient
    lowp vec3 fillColor = mix(vColor.rgb, white, -dist * vGradientStrength);

    float pixelWidth = 2.0 / vSize;

    if (vStrokeWidth > 0.0) {
        float strokeWidth = vStrokeWidth * uDevicePixelRatio * pixelWidth; // TODO: Move computation to vertex shader

        lowp float strokeFraction = linearstep(-strokeWidth, -strokeWidth - pixelWidth, dist);
        lowp float alpha = linearstep(0., -pixelWidth, dist) * vColor.a;

        fragColor = vec4(mix(strokeColor, fillColor, strokeFraction) * alpha, alpha);

    } else {
        lowp float alpha = linearstep(0., -pixelWidth, dist) * vColor.a;

        fragColor = vec4(fillColor * alpha, alpha);
    }

    if (uPickingEnabled) {
        fragColor = vPickingColor;
    }
}

