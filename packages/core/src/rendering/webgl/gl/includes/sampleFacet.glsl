
/** Describes where a sample facet should be shown. */
struct SampleFacetPosition {
    float pos;
    float height;
};

// ----------------------------------------------------------------------------

#ifndef SAMPLE_FACET_UNIFORM

SampleFacetPosition getSampleFacetPos() {
    return SampleFacetPosition(0.0, 1.0);
}

#else

/**
 * Location and height of the band on the Y axis on a normalized [0, 1] scale.
 * Elements: position, height
 */
uniform vec2 uSampleFacet;

SampleFacetPosition getSampleFacetPos() {
    return SampleFacetPosition(
        1.0 - uSampleFacet.x - uSampleFacet.y,
        uSampleFacet.y
    );
}

#endif

vec2 applySampleFacet(vec2 pos) {
    SampleFacetPosition facetPos = getSampleFacetPos();
    return vec2(pos.x, facetPos.pos + pos.y * facetPos.height);
}

#if defined(CLAMP_X) || defined(CLAMP_Y)
vec2 clampPosition(vec2 pos) {
#ifdef CLAMP_X
    pos.x = clamp(pos.x, 0.0, 1.0);
#endif
#ifdef CLAMP_Y
    SampleFacetPosition facet = getSampleFacetPos();
    pos.y = clamp(pos.y, facet.pos, facet.pos + facet.height);
#endif
    return pos;
}
#else
#define clampPosition(pos) (pos)
#endif
