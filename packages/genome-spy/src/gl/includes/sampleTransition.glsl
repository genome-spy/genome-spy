
/**
 * Location and height of the band on the Y axis on a normalized [0, 1] scale.
 * Top as the first element, height as the second element.
 * TODO: Put everything in a vec4
 */
uniform vec2 yPosLeft;
uniform vec2 yPosRight;

uniform float transitionOffset;

bool isFacetedSamples() {
    return false;
}

bool isInTransit() {
    return yPosLeft != yPosRight;
}

vec2 applySampleFacet(vec2 pos) {
    if (!isFacetedSamples()) {
        return pos;

    } else if (isInTransit()){
        float fraction = smoothstep(0.0, 0.7 + transitionOffset, (pos.x - transitionOffset) * 2.0);
        vec2 interpolated = mix(yPosLeft, yPosRight, fraction);

        float top = interpolated[0];
        float height = interpolated[1];

        return vec2(pos.x, top + pos.y * height);

    } else {
        return vec2(pos.x, yPosLeft[0] + pos.y * yPosLeft[1]);
    }
}

float getSampleFacetHeight(vec2 pos) {
    // TODO: implement
    return 1.0;
}
