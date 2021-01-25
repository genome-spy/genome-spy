
/**
 * Describes where a sample facet should be shown. Interpolating between the
 * current and target positions/heights allows for transitioning between facet
 * configurations.
 */
struct SampleFacetPosition {
    float pos;
    float height;
    float targetPos;
    float targetHeight;
};

/**
 * Trasition fraction [0, 1] between the current and target configurations.
 */
uniform float uTransitionOffset;

/**
 * Location and height of the band on the Y axis on a normalized [0, 1] scale.
 * Elements: curr pos, curr height, target pos, target height
 */
uniform vec4 uSampleFacet;

SampleFacetPosition getSampleFacetPos() {
    return SampleFacetPosition(
        uSampleFacet.x,
        uSampleFacet.y,
        uSampleFacet.z,
        uSampleFacet.w
    );
}

bool isFacetedSamples(SampleFacetPosition facetPos) {
    return facetPos != SampleFacetPosition(0.0, 1.0, 0.0, 1.0);
}

bool isFacetedSamples() {
    return isFacetedSamples(getSampleFacetPos());
}

bool isInTransit() {
    return uTransitionOffset > 0.0;
}

float getTransitionFraction(float xPos) {
    return smoothstep(0.0, 0.7 + uTransitionOffset, (xPos - uTransitionOffset) * 2.0);
}

vec2 applySampleFacet(vec2 pos) {
    SampleFacetPosition facetPos = getSampleFacetPos();

    if (!isFacetedSamples(facetPos)) {
        return pos;
    } else if (isInTransit()) {
        vec2 interpolated = mix(
            vec2(facetPos.pos, facetPos.height),
            vec2(facetPos.targetPos, facetPos.targetHeight),
            getTransitionFraction(pos.x));
        return vec2(pos.x, interpolated[0] + pos.y * interpolated[1]);
    } else {
        return vec2(pos.x, facetPos.pos + pos.y * facetPos.height);
    }
}

float getSampleFacetHeight(vec2 pos) {
    SampleFacetPosition facetPos = getSampleFacetPos();

    if (!isFacetedSamples(facetPos)) {
        return 1.0;
    } else if (isInTransit()) {
        return mix(
            facetPos.height,
            facetPos.targetHeight,
            getTransitionFraction(pos.x));
    } else {
        return facetPos.height;
    }
}
