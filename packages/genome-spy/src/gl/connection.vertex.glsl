uniform float uZoomLevel;

uniform float uBandwidth;

in vec2 strip;

out vec4 vColor;

/** Stroke width */
out float vSize;

/** The distance from the line center to the direction of normal in pixels */
out float vNormalLengthInPixels;

void main(void) {
    float pixelSize = 1.0 / uDevicePixelRatio;

    float opacity = getScaled_opacity() * uViewOpacity;
    float x = getScaled_x();
    float x2 = getScaled_x2();
    float y = getScaled_y();
    float y2 = getScaled_y2();
    float size = getScaled_size();
    float size2 = getScaled_size2();
    float height = getScaled_height();
    
    float hY;

    if (y == y2) {
        // Let's create an arc
        if (uBandwidth == 0.0) {
            // Move the control points so that the unit-height connection produces a unit-height arc
            float stretch = 1.0 / 0.75; // TODO: Apply to height outside the shader

            hY = height * stretch * uZoomLevel + max(y, y2);
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

    // TODO: Scale the stroke width as the transition progresses, fix the aspect ratio of faceted strokes
    float mixedSize = mix(size, size2, t);

    // Avoid artifacts in very thin lines by clamping the size and adjusting opacity respectively
    if (mixedSize < pixelSize) {
        opacity *= mixedSize / pixelSize;
        mixedSize = pixelSize;
    }

    // Add an extra pixel to stroke width to accommodate edge antialiasing
    float paddedSize = mixedSize + pixelSize;

    vNormalLengthInPixels = strip.y * paddedSize;
    
    // Extrude
    p += normal * vNormalLengthInPixels / uViewportSize;

    gl_Position = unitToNdc(p);

    // Yuck, RGB interpolation in gamma space! TODO: linear space: https://unlimited3d.wordpress.com/2020/01/08/srgb-color-space-in-opengl/
    // TODO: Optimize: don't mix if only the primary color channel is utilized
    vColor = vec4(mix(getScaled_color(), getScaled_color2(), t) * opacity, opacity);

    vSize = paddedSize;
}
