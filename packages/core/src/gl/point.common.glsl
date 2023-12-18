/**
 * The stroke should only grow inwards, e.g, the diameter/outline is not affected by the stroke width.
 * Thus, a point that has a zero size has no visible stroke. This allows strokes to be used with
 * geometric zoom, etc.
 */
uniform bool uInwardStroke;

/** Maximum size of the largest point as the fraction of the height of the (faceted) view */
uniform lowp float uMaxRelativePointDiameter;

/** Scale factor for geometric zoom */
uniform float uScaleFactor;

/** The size of the largest point in the data */
uniform float uMaxPointSize;

uniform float uZoomLevel;
uniform float uSemanticThreshold;

uniform float uGradientStrength;
