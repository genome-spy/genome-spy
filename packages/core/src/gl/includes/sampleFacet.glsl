

#if defined(SAMPLE_FACET_UNIFORM)

uniform float uSampleFacetOffset;
uniform float uSampleFacetHeight;

vec2 applySampleFacet(vec2 pos) {
    float offset = uViewSize.y - uSampleFacetOffset - uSampleFacetHeight;
    return vec2(pos.x, pos.y + offset);
}

#elif defined(SAMPLE_FACET_TEXTURE)

uniform sampler2D uSampleFacetTexture;

vec2 applySampleFacet(vec2 pos) {
    vec2 texel = texelFetch(uSampleFacetTexture, ivec2(int(attr_facetIndex), 0), 0).rg;
    float height = texel[1];
    float offset = uViewSize.y - texel[0];

    // It's assumed that the mark fills the entire height of the view.
    // Thus, pos.y is adjusted to account for the height of the sample facet.
    return vec2(pos.x, pos.y * height / uViewSize.y + offset - height);
}

#else

vec2 applySampleFacet(vec2 pos) {
    return pos;
}

#endif

