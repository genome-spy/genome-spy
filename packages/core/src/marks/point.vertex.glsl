out float vRadius;
out float vRadiusWithPadding;
out lowp vec4 vFillColor;
out lowp vec4 vStrokeColor;
out lowp float vShape;
out lowp float vHalfStrokeWidth;
out mat2 vRotationMatrix;

// Copypaste from fragment shader
const float CIRCLE = 0.0;
const float SQUARE = 1.0;
const float CROSS = 2.0;
const float DIAMOND = 3.0;
const float TRIANGLE_UP = 4.0;
const float TRIANGLE_RIGHT = 5.0;
const float TRIANGLE_DOWN = 6.0;
const float TRIANGLE_LEFT = 7.0;
const float TICK_UP = 8.0;
const float TICK_RIGHT = 9.0;
const float TICK_DOWN = 10.0;
const float TICK_LEFT = 11.0;

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

    return clamp(0.0, maxPointDiameter, factor) / maxPointDiameter;
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
    float shapeAngle = 0.0;

    float semanticThresholdFactor = computeSemanticThresholdFactor();
    if (semanticThresholdFactor <= 0.0) {
        gl_PointSize = 0.0;
        // Place the vertex outside the viewport. The default (0, 0) makes this super-slow
        // on Apple Silicon. Probably related to the tile-based GPU architecture.
        gl_Position = vec4(100.0, 0.0, 0.0, 0.0);
        // Exit early. MAY prevent some unnecessary calculations.
        return;
    }

    float size = getScaled_size();
    vec2 pos = vec2(getScaled_x(), getScaled_y()) + getDxDy();

    gl_Position = unitToNdc(applySampleFacet(pos));

    float strokeWidth = getScaled_strokeWidth();

    float diameter = sqrt(size) *
        uScaleFactor *
        semanticThresholdFactor *
        getDownscaleFactor(pos);

    // Clamp minimum size and adjust opacity instead. Yields more pleasing result,
    // no flickering etc.
    float opacity = uViewOpacity;
	if (strokeWidth <= 0.0 || uInwardStroke) {
		float minDiameter = 1.0 / uDevicePixelRatio;
		if (diameter < minDiameter) {
			// We do some "cheap" gamma correction here. It breaks on dark background, though.
			// First we take a square of the size and then apply "gamma" of 1.5.
			opacity *= pow(diameter / minDiameter, 2.5);
			diameter = minDiameter;
		}
	}

	float fillOpa = getScaled_fillOpacity() * opacity;
	float strokeOpa = getScaled_strokeOpacity() * opacity;

    vShape = getScaled_shape();

	// Circle doesn't have sharp corners. Do some special optimizations to minimize the point size.
	bool circle = vShape == 0.0;

    if (vShape > TICK_UP && vShape <= TICK_LEFT) {
        shapeAngle = (vShape - TICK_UP) * 90.0;
        vShape = TICK_UP;
    } else if (vShape > TRIANGLE_UP && vShape <= TRIANGLE_LEFT) {
        shapeAngle = (vShape - TRIANGLE_UP) * 90.0;
        vShape = TRIANGLE_UP;
    }

	float angleInDegrees = getScaled_angle();
	float angle = -(shapeAngle + angleInDegrees) * PI / 180.0;
    float sinTheta = sin(angle);
    float cosTheta = cos(angle);
    vRotationMatrix = mat2(cosTheta, sinTheta, -sinTheta, cosTheta);

    // Not needed if we would draw rotated quads instead of gl.POINTS
	float roomForRotation = circle ? 1.0 : sin(mod(angle, PI / 2.0) + PI / 4.0) / sin(PI / 4.0);

	float aaPadding = 1.0 / uDevicePixelRatio;
	float rotationPadding = (diameter * roomForRotation) - diameter;
	// sqrt(3.0) ensures that the angles of equilateral triangles have enough room
	float strokePadding = uInwardStroke ? 0.0 : strokeWidth * (circle ? 1.0 : sqrt(3.0));
	float padding = rotationPadding + strokePadding + aaPadding;
    gl_PointSize = (diameter + padding) * uDevicePixelRatio;

	vRadius = diameter / 2.0;
	vRadiusWithPadding = vRadius + padding / 2.0;

    vHalfStrokeWidth = strokeWidth / 2.0;

    vFillColor = vec4(getScaled_fill() * fillOpa, fillOpa);
    vStrokeColor = vec4(getScaled_stroke() * strokeOpa, strokeOpa);

    setupPicking();
}
