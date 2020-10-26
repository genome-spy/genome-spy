
/**
 * Location and height of the band on the Y axis on a normalized [0, 1] scale.
 * Elements: left pos, left height, right pos, right height
 */
uniform vec4 uSampleFacet;

uniform float transitionOffset;

bool isFacetedSamples() {
    return false;
}

bool isInTransit() {
    return uSampleFacet.xy != uSampleFacet.zw;
}

vec2 applySampleFacet(vec2 pos) {
    if (!isFacetedSamples()) {
        return pos;

    } else {
        vec2 left = uSampleFacet.xy;
        vec2 right = uSampleFacet.zw;

        vec2 interpolated = left;

        if (isInTransit()) {
            float fraction = smoothstep(0.0, 0.7 + transitionOffset, (pos.x - transitionOffset) * 2.0);
            vec2 interpolated = mix(left, right, fraction);
        }

        return vec2(pos.x, interpolated.x + pos.y * interpolated.y);
    }
}

float getSampleFacetHeight(vec2 pos) {
    // TODO: implement
    return 1.0;
}
