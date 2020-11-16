
/**
 * Location and height of the band on the Y axis on a normalized [0, 1] scale.
 * Elements: left pos, left height, right pos, right height
 */
uniform vec4 uSampleFacet;

uniform float uTransitionOffset;

bool isFacetedSamples() {
    // TODO: Provide a constant for more agressive optimization
    return uSampleFacet != vec4(0.0, 1.0, 0.0, 1.0);
}

bool isInTransit() {
    return uSampleFacet.xy != uSampleFacet.zw;
}

float getTransitionFraction(float xPos) {
    return smoothstep(0.0, 0.7 + uTransitionOffset, (xPos - uTransitionOffset) * 2.0);
}

vec2 applySampleFacet(vec2 pos) {
    if (!isFacetedSamples()) {
        return pos;
    } 

    vec2 left = uSampleFacet.xy;
    vec2 right = uSampleFacet.zw;

    vec2 interpolated = left;

    if (isInTransit()) {
        interpolated = mix(left, right, getTransitionFraction(pos.x));
    }
    return vec2(pos.x, interpolated.x + pos.y * interpolated.y);
}

float getSampleFacetHeight(vec2 pos) {
    if (!isFacetedSamples()) {
        return 1.0;
    } 

    float left = uSampleFacet.y;
    float right = uSampleFacet.w;

    float interpolated = left;

    if (isInTransit()) {
        interpolated = mix(left, right, getTransitionFraction(pos.x));
    }

    return left;
}
