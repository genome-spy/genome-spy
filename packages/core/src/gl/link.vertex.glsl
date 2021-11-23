uniform float uSagittaScaleFactor;

/** Make very small arcs visible */
uniform float uMinSagittaLength;

in vec2 strip;

out vec4 vColor;

/** Stroke width */
out float vSize;

/** The distance from the line center to the direction of normal in pixels */
out float vNormalLengthInPixels;

void main(void) {
    float pixelSize = 1.0 / uDevicePixelRatio;
    float opacity = getScaled_opacity() * uViewOpacity;

    vec2 a = vec2(getScaled_x(), getScaled_y()) * uViewportSize;
    vec2 b = vec2(getScaled_x2(), getScaled_y2()) * uViewportSize;
    
    vec2 chordVector = b - a;
    vec2 unitChordVector = normalize(chordVector);
    vec2 chordNormal = vec2(-unitChordVector.y, unitChordVector.x);

    float sagitta = max(
        length(chordVector) / 2.0 * uSagittaScaleFactor,
        uMinSagittaLength
    );

    bool compress = false;
    if (compress) {
        // Work in progres...
        float maxSagittaLen = length(chordNormal * uViewportSize);
        float maxChordLen = length(unitChordVector * uViewportSize);

        float threshold = maxSagittaLen * 0.5;
        if (sagitta > threshold) {
            float m = (maxSagittaLen - threshold) / (maxChordLen - threshold);
            sagitta = (sagitta - threshold) * m + threshold;
        }
    }

    vec2 controlOffset = chordNormal * sagitta / 0.75;

    vec2 p1 = a;
    vec2 p2 = a + controlOffset;
    vec2 p3 = b + controlOffset;
    vec2 p4 = b;

    // Make segments shorter near the endpoints to make the tightly bent attachment points smoother
    float t = smoothstep(0.0, 1.0, strip.x);

    // https://stackoverflow.com/a/31317254/1547896
    vec2 C1 = p4 - 3.0 * p3 + 3.0 * p2 - p1;
    vec2 C2 = 3.0 * p3 - 6.0 * p2 + 3.0 * p1;
    vec2 C3 = 3.0 * p2 - 3.0 * p1;
    vec2 C4 = p1;

    vec2 p;
    // Skip computation at endpoints to maintain precision
    if (t == 0.0) {
        p = p1;
    } else if (t == 1.0) {
        p = p4;
    } else {
        p = C1*t*t*t + C2*t*t + C3*t + C4;
    }

    vec2 tangent = normalize(3.0*C1*t*t + 2.0*C2*t + C3);
    vec2 normal = vec2(-tangent.y, tangent.x);

    //p = applySampleFacet(p);

#ifdef size2_DEFINED
    float mixedSize = mix(getScaled_size(), getScaled_size2(), t);
#else
    float mixedSize = getScaled_size();
#endif

    // Avoid artifacts in very thin lines by clamping the size and adjusting opacity respectively
    if (mixedSize < pixelSize) {
        opacity *= mixedSize / pixelSize;
        mixedSize = pixelSize;
    }

    // Add an extra pixel to stroke width to accommodate edge antialiasing
    float paddedSize = mixedSize + pixelSize;

    vNormalLengthInPixels = strip.y * paddedSize;
    
    // Extrude
    p += normal * vNormalLengthInPixels;

    gl_Position = pixelsToNdc(p);

#ifdef color2_DEFINED
    // Yuck, RGB interpolation in gamma space!
    // TODO: linear space: https://unlimited3d.wordpress.com/2020/01/08/srgb-color-space-in-opengl/
    vec3 color = mix(getScaled_color(), getScaled_color2(), t);
#else 
    vec3 color = getScaled_color();
#endif

    vColor = vec4(color * opacity, opacity);

    vSize = paddedSize;

    setupPicking();
}
