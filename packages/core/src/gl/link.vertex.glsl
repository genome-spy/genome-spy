uniform float uArcHeightFactor;

/** Make very small arcs visible */
uniform float uMinArcHeight;

/** The minimum stroke width in pixels when rendering into the picking buffer */
uniform float uMinPickingSize;

uniform int uShape;
uniform int uOrient;
uniform bool uClampApex;

in vec2 strip;

out vec4 vColor;

/** Stroke width */
out float vSize;

/** The distance from the line center to the direction of normal in pixels */
out float vNormalLengthInPixels;

const int SHAPE_ARC = 0;
const int SHAPE_DOME = 1;
const int SHAPE_DIAGONAL = 2;
const int SHAPE_LINE = 3;
const int ORIENT_VERTICAL = 0;
const int ORIENT_HORIZONTAL = 1;

void main(void) {
    float pixelSize = 1.0 / uDevicePixelRatio;
    float opacity = getScaled_opacity() * uViewOpacity;

    // The bezier's control points
    vec2 p1, p2, p3, p4;

    vec2 a = applySampleFacet(vec2(getScaled_x(), getScaled_y())) * uViewportSize;
    vec2 b = applySampleFacet(vec2(getScaled_x2(), getScaled_y2())) * uViewportSize;

    if (uShape <= SHAPE_DOME) {
        if (uShape == SHAPE_DOME) {
            vec2 height = vec2(0.0);
            if (uOrient == ORIENT_VERTICAL) {
                p1 = vec2(min(a.x, b.x), b.y);
                p4 = vec2(max(a.x, b.x), b.y);
                height = vec2(0.0, a.y - b.y);

                if (uClampApex) {
                    if (p4.x > 0.0) {
                        p1.x = max(p1.x, -p4.x);
                    }
                    if (p1.x < uViewportSize.x) {
                        p4.x = min(p4.x, 2.0 * uViewportSize.x - p1.x);
                    }
                }

            } else {
                p1 = vec2(b.x, min(a.y, b.y));
                p4 = vec2(b.x, max(a.y, b.y));
                height = vec2(a.x - b.x, 0.0);

                if (uClampApex) {
                    if (p4.y > 0.0) {
                        p1.y = max(p1.y, -p4.y);
                    }
                    if (p1.y < uViewportSize.y) {
                        p4.y = min(p4.y, 2.0 * uViewportSize.y - p1.y);
                    }
                }
            }

            vec2 controlOffset = height / 0.75;

            p2 = p1 + controlOffset;
            p3 = p4 + controlOffset;

        } if (uShape == SHAPE_ARC) {
            p1 = a;
            p4 = b;

            vec2 chordVector = p4 - p1;
            vec2 unitChordVector = normalize(chordVector);
            vec2 chordNormal = vec2(-unitChordVector.y, unitChordVector.x);

            float height = max(
                length(chordVector) / 2.0 * uArcHeightFactor,
                uMinArcHeight
            );

            // This is a bit poor approximation of a circular arc, but it's probably enough for most purposes.
            // TODO: Consider a more sophisticated approach: https://stackoverflow.com/a/44829356/1547896
            vec2 controlOffset = chordNormal * height / 0.75;

            p2 = p1 + controlOffset;
            p3 = p4 + controlOffset;
        }

    } else if (uShape == SHAPE_DIAGONAL) {
        if (uOrient == ORIENT_VERTICAL) {
            p1 = a;
            p2 = vec2(a.x, (a.y + b.y) / 2.0);
            p3 = vec2(b.x, (a.y + b.y) / 2.0);
            p4 = b;
        } else {
            p1 = a;
            p2 = vec2((a.x + b.x) / 2.0, a.y);
            p3 = vec2((a.x + b.x) / 2.0, b.y);
            p4 = b;
        }
    } else if (uShape == SHAPE_LINE) {
        p1 = a;
        p2 = (a + b) / 2.0;
        p3 = p2;
        p4 = b;
    }

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

    float size = getScaled_size();

    // Avoid artifacts in very thin lines by clamping the size and adjusting opacity respectively
    if (size < pixelSize) {
        opacity *= size / pixelSize;
        size = pixelSize;
    }

    // Handle minimum picking size or add an extra pixel to the stroke width to accommodate edge antialiasing
    float paddedSize = uPickingEnabled
        ? max(size, uMinPickingSize)
        : size + pixelSize;

    vNormalLengthInPixels = strip.y * paddedSize;
    
    // Extrude
    p += normal * vNormalLengthInPixels;

    gl_Position = pixelsToNdc(p);

    vec3 color = getScaled_color();

    vColor = vec4(color * opacity, opacity);

    vSize = paddedSize;

    setupPicking();
}
