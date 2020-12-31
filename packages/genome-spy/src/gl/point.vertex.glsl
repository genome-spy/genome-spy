precision mediump float;

#pragma SCALES_HERE

in lowp float shape;

/** Maximum size of the largest point as the fraction of the height of the (faceted) view */
uniform lowp float uMaxRelativePointDiameter;
/** Minimum width/height in pixels of the largest point */
uniform lowp float uMinAbsolutePointDiameter;

/** Scale factor for geometric zoom */
uniform float uScaleFactor;

/** The size of the largest point in the data */
uniform float uMaxPointSize;

uniform float uZoomLevel;
uniform float uSemanticThreshold;

out float vSize;
out lowp vec4 vColor;
out lowp float vShape;
out lowp float vStrokeWidth;
out lowp float vGradientStrength;


float computeSemanticThresholdFactor() {
    // TODO: add smooth transition
    return getScaled_semanticScore() >= uSemanticThreshold ? 1.0 : 0.0;
}

/**
 * Computes a scaling factor for the points in a sample-faceted view.
 */
float getDownscaleFactor(vec2 pos) {
    if (!isFacetedSamples()) {
        return 1.0;
    }

    float sampleFacetHeight = getSampleFacetHeight(pos);
    float maxPointDiameter = sqrt(uMaxPointSize);

    float factor = sampleFacetHeight *
        uViewportSize.y *
        uMaxRelativePointDiameter;

    // Points should not be visible on zero-height bands.
    float minimum = linearstep(0.0, 0.5, sampleFacetHeight) * uMinAbsolutePointDiameter;

    return max(minimum, min(maxPointDiameter, factor)) / maxPointDiameter;
}

// TODO: Move this into common.glsl or something
vec2 getDxDy() {
#if defined(dx_DEFINED) || defined(dy_DEFINED)
    return vec2(getScaled_dx(), getScaled_dy()) / uViewportSize;
#else
    return vec2(0.0, 0.0);
#endif
}

void main(void) {

    float semanticThresholdFactor = computeSemanticThresholdFactor();
    if (semanticThresholdFactor <= 0.0) {
        gl_PointSize = 0.0;
        // Exit early. MAY prevent some unnecessary calculations.
        return;
    }

    float size = getScaled_size();
    vec2 pos = vec2(getScaled_x(), getScaled_y()) + getDxDy();

    gl_Position = unitToNdc(applySampleFacet(pos));

    vSize = sqrt(size) *
        uScaleFactor *
        semanticThresholdFactor *
        getDownscaleFactor(pos) *
        uDevicePixelRatio;

    // Clamp minimum size and adjust opacity instead. Yields more pleasing result,
    // no flickering etc.
    float opacity = getScaled_opacity() * uViewOpacity;
    const float sizeLimit = 2.0;
    if (vSize < sizeLimit) {
        // We do some "cheap" gamma correction here. It breaks on dark background, though.
        // First we take a square of the size and then apply "gamma" of 1.5.
        opacity *= pow(vSize / sizeLimit, 2.5);
        vSize = sizeLimit;
    }
    opacity *= semanticThresholdFactor;

    gl_PointSize = vSize;

    vColor = vec4(getScaled_color(), opacity); // Premultiplied in fragment shader
    vShape = shape;
    vStrokeWidth = getScaled_strokeWidth();
    vGradientStrength = getScaled_gradientStrength();
}
