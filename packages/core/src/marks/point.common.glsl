layout(std140) uniform Mark {
    /**
    * The stroke should only grow inwards, e.g, the diameter/outline is not affected by the stroke width.
    * Thus, a point that has a zero size has no visible stroke. This allows strokes to be used with
    * geometric zoom, etc.
    */
    uniform bool uInwardStroke;

    /** The minimum point size in pixels when rendering into the picking buffer */
    uniform float uMinPickingSize;

    /** Scale factor for geometric zoom */
    uniform mediump float uScaleFactor;

    uniform mediump float uZoomLevel;
    uniform highp float uSemanticThreshold;

    uniform mediump float uGradientStrength;

#pragma markUniforms
};
