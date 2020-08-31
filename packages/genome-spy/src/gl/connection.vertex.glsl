precision mediump float;

@import ./includes/xdomain;
@import ./includes/ydomain;
@import ./includes/sampleTransition;

uniform vec2 uViewportSize;
uniform lowp float uDevicePixelRatio;
uniform float zoomLevel; // TODO: u prefix

uniform float uBandwidth;

attribute vec2 strip;

attribute highp vec2 x;
attribute highp vec2 x2;
attribute float y;
attribute float y2;
attribute float height;
attribute lowp vec3 color;
attribute lowp vec3 color2;
attribute lowp float opacity;
attribute float size;
attribute float size2;

varying vec4 vColor;

void main(void) {

    float nX = normalizeX(x);
    float nX2 = normalizeX(x2);
    float nY = normalizeY(y);
    float nY2 = normalizeY(y2);
    
    float hY;

    if (nY == nY2) {
        if (uBandwidth == 0.0) {
            // Move the control points so that the unit-height connection produces a unit-height arc
            float stretch = 1.0 / 0.75; // TODO: Apply to height outside the shader

            hY = height * stretch * zoomLevel + max(nY, nY2);
        } else {
            // Move above the band
            nY += uBandwidth;
            nY2 = nY;
            hY = nY + uBandwidth * 0.4; // TODO: breaks when outer padding is zero or something very small
        }

    } else {
        if (nY < nY2) {
            nY += uBandwidth;
        } else if (nY2 < nY) {
            nY2 += uBandwidth;
        }

        hY = (nY + nY2) / 2.0;
    }

    vec2 p1 = vec2(nX, nY);
    vec2 p2 = vec2(nX, hY);
    vec2 p3 = vec2(nX2, hY);
    vec2 p4 = vec2(nX2, nY2);

    // Segments are shorter near the endpoints to make tightly bent curves smoother
    float t = smoothstep(0.0, 1.0, strip.x);

    // https://stackoverflow.com/a/31317254/1547896
    vec2 C1 = p4 - 3.0 * p3 + 3.0 * p2 - p1;
    vec2 C2 = 3.0 * p3 - 6.0 * p2 + 3.0 * p1;
    vec2 C3 = 3.0 * p2 - 3.0 * p1;
    vec2 C4 = p1;

    vec2 p;
    // Skip computation on endpoints to maintain precision
    if (t == 0.0) {
        p = p1;
    } else if (t == 1.0) {
        p = p4;
    } else {
        p = C1*t*t*t + C2*t*t + C3*t + C4;
    }

    vec2 tangent = normalize(3.0 * C1*t*t + 2.0*C2*t + C3);
    vec2 normal = vec2(-tangent.y, tangent.x);

    // Extrude
    p += strip.y * normal * mix(size, size2, t) / uViewportSize * uDevicePixelRatio;


    vec2 ndc = p * 2.0 - 1.0;

    gl_Position = vec4(ndc, 0.0, 1.0);
    // Yuck, RGB interpolation in gamma space! TODO: linear space: https://unlimited3d.wordpress.com/2020/01/08/srgb-color-space-in-opengl/
    vColor = vec4(mix(color, color2, t) * opacity, opacity);
}
