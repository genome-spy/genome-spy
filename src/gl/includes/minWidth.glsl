/**
 * Width of the rectangle.
 *
 * Negative if the leftmost vertex,
 * positive if rightmost vertex,
 * zero if in the middle.
 */
attribute float width;

/** Minimum width of the displayed rectangle in normalized [0, 1] coordinates */
uniform float uMinWidth;

/** Minimum rect opacity when the rect is narrower than the minimum width */
const float minOpacity = 0.10;

float applyMinWidth(inout float normalizedX) {
    float opacity = 1.0;

    if (width != 0.0) {
        float normalizedWidth = width / uDomainWidth.x;
        if (abs(normalizedWidth) < uMinWidth) {
            // The rectangle is too narrow, stretch it to make it more visible

            normalizedX += (uMinWidth * sign(width) - normalizedWidth) / 2.0;

            // Clamp opacity to ensure that all exons are at least somewhat visible
            // TODO: Could use gamma correction here
            opacity = max(abs(normalizedWidth) / uMinWidth, minOpacity);
        }
    }

    return opacity;
}
