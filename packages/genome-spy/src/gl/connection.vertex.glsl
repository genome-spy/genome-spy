#pragma SCALES_HERE

uniform float zoomLevel; // TODO: u prefix

uniform float uBandwidth;

attribute vec2 strip;

in float height;
in lowp vec3 color;
in lowp vec3 color2;
in float size;
in float size2;

out vec4 vColor;

void main(void) {

    float opacity = getScaled_opacity();
    float x = getScaled_x();
    float x2 = getScaled_x2();
    float y = getScaled_y();
    float y2 = getScaled_y2();
    
    float hY;

    if (y == y2) {
        // Let's create an arc
        if (uBandwidth == 0.0) {
            // Move the control points so that the unit-height connection produces a unit-height arc
            float stretch = 1.0 / 0.75; // TODO: Apply to height outside the shader

            hY = height * stretch * zoomLevel + max(y, y2);
        } else {
            // Move above the band
            y += uBandwidth;
            y2 = y;
            hY = y + uBandwidth * 0.4; // TODO: breaks when outer padding is zero or something very small
        }

    } else {
        // Not an arc, a curve instead!
        if (y < y2) {
            y += uBandwidth;
        } else if (y2 < y) {
            y2 += uBandwidth;
        }

        hY = (y + y2) / 2.0;
    }

    vec2 p1 = vec2(x, y);
    vec2 p2 = vec2(x, hY);
    vec2 p3 = vec2(x2, hY);
    vec2 p4 = vec2(x2, y2);

    // Let's make segments shorter near the endpoints to make the tightly bent attachment points smoother
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

    p = applySampleFacet(p);

    vec2 tangent = 3.0 * C1*t*t + 2.0*C2*t + C3;
    vec2 normal = normalize(vec2(-tangent.y, tangent.x) / uViewportSize);

    // Extrude
    // TODO: Scale the stroke width as the transition progresses, fix the aspect ratio of faceted strokes
    p += strip.y * normal * mix(size, size2, t) / uViewportSize;

    gl_Position = unitToNdc(p);

    // Yuck, RGB interpolation in gamma space! TODO: linear space: https://unlimited3d.wordpress.com/2020/01/08/srgb-color-space-in-opengl/
    vColor = vec4(mix(color, color2, t) * opacity, opacity);
}
