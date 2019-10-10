precision mediump float;

const lowp vec3 white = vec3(1.0);
const lowp vec3 black = vec3(0.0);

uniform lowp float uDevicePixelRatio;

varying lowp vec4 vColor;
varying float vSize;
varying lowp float vShape;
varying lowp float vStrokeWidth;
varying lowp float vGradientStrength;

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

float circle() {
    return length(npc()) - 1.0;
}

float square() {
    vec2 pos = abs(npc());
    return max(pos.x, pos.y) - 1.0;
}

// Triangle, cross, and diamond are based on:
// http://www.iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm

float sdEquilateralTriangle(bool flip, bool swap) {
    vec2 p = npc();
    if (swap) {
        p.xy = p.yx;
    }
    if (flip) {
        p.y = -p.y;
    }
    p.y += 0.25;

    const float k = sqrt(3.0);
    p.x = abs(p.x) - 1.0;
    p.y = p.y + 1.0 / k;
    if (p.x + k * p.y > 0.) {
        p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.;
    }
    p.x -= clamp(p.x, -2.0, 0.0);
    return -length(p) * sign(p.y);
}


float sdCross() {
    const float r = 0.0;
    const vec2 b = vec2(1.0, 0.4);

    vec2 p = abs(npc());
    p = (p.y > p.x) ? p.yx : p.xy;
    vec2  q = p - b;
    float k = max(q.y, q.x);
    vec2  w = (k > 0.0) ? q : vec2(b.y - p.x, -k);
    return sign(k) * length(max(w, 0.0)) + r;
}

float ndot(vec2 a, vec2 b) {
    return a.x * b.x - a.y * b.y;
}

float sdRhombus() {
    const vec2 b = vec2(1.0);

    vec2 q = abs(npc());
    float h = clamp((-2.0 * ndot(q, b) + ndot(b, b)) / dot(b, b), -1.0, 1.0);
    float d = length(q - 0.5 * b * vec2(1.0 - h, 1.0 + h));
    return d * sign(q.x * b.y + q.y * b.x - b.x * b.y);
}

void main() {
    float dist;
    
    // We could also use textures here. Could even be faster, because we have plenty of branching here.
    if (vShape == CIRCLE) {
        dist = circle();

    } else if (vShape == SQUARE) {
        dist = square();

    } else if (vShape == TRIANGLE_UP) {
        dist = sdEquilateralTriangle(true, false);

    } else if (vShape == CROSS) {
        dist = sdCross();

    } else if (vShape == DIAMOND) {
        dist = sdRhombus();

    } else if (vShape == TRIANGLE_DOWN) {
        dist = sdEquilateralTriangle(false, false);

    } else if (vShape == TRIANGLE_RIGHT) {
        dist = sdEquilateralTriangle(false, true);

    } else if (vShape == TRIANGLE_LEFT) {
        dist = sdEquilateralTriangle(true, true);

    } else {
        dist = 0.0;
    }

    if (dist > 0.3)
        discard;

    lowp vec3 strokeColor = mix(vColor.rgb, black, 0.3); 
    // Stuble radial gradient
    lowp vec3 fillColor = mix(vColor.rgb, white, -dist * vGradientStrength);

    // Could use fwidth here, but GL_OES_standard_derivatives is not always available
    float pixelWidth = 2.0 / vSize;

    if (vStrokeWidth > 0.0) {
        float strokeWidth = vStrokeWidth * uDevicePixelRatio * pixelWidth; // TODO: Move computation to vertex shader

        lowp float strokeFraction = smoothstep(-strokeWidth, -strokeWidth - pixelWidth, dist);
        lowp float alpha = smoothstep(0., -pixelWidth, dist) * vColor.a;

        gl_FragColor = vec4(mix(strokeColor, fillColor, strokeFraction) * alpha, alpha);

    } else {
        lowp float alpha = smoothstep(0., -pixelWidth, dist) * vColor.a;

        gl_FragColor = vec4(fillColor * alpha, alpha);
    }
}

