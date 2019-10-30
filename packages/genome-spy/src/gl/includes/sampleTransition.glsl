
/**
 * Location and height of the band on the Y axis on a normalized [0, 1] scale.
 * Top as the first element, height as the second element.
 */
uniform vec2 yPosLeft;
uniform vec2 yPosRight;

uniform float transitionOffset;

vec2 transit(float normalizedX, float y) {
    float top, height;

    if (yPosLeft == yPosRight) {
        // Left and right are the same, no bending
        top = yPosLeft[0];
        height = yPosLeft[1];

    } else {
        float fraction = smoothstep(0.0, 0.7 + transitionOffset, (normalizedX - transitionOffset) * 2.0);
        vec2 interpolated = mix(yPosLeft, yPosRight, fraction);
        top = interpolated[0];
        height = interpolated[1];
    }

    return vec2(top + y * height, height);
}