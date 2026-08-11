
/** Describes where a sample facet should be shown. */
struct SampleFacetPosition {
    float pos;
    float height;
};

// ----------------------------------------------------------------------------

#if !defined(SAMPLE_FACET_UNIFORM) && !defined(SAMPLE_FACET_TEXTURE)

SampleFacetPosition getSampleFacetPos() {
    return SampleFacetPosition(0.0, 1.0);
}

#elif defined(SAMPLE_FACET_UNIFORM)

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

#elif defined(SAMPLE_FACET_TEXTURE)

uniform sampler2D uSampleFacetTexture;

SampleFacetPosition getSampleFacetPos() {
    vec2 texel = texelFetch(
        uSampleFacetTexture,
        ivec2(int(attr_facetIndex), 0),
        0
    ).rg;
    return SampleFacetPosition(
        1.0 - texel.x - texel.y,
        texel.y
    );
}

#endif

vec2 applySampleFacet(vec2 pos) {
    SampleFacetPosition facetPos = getSampleFacetPos();
    return vec2(pos.x, facetPos.pos + pos.y * facetPos.height);
}
