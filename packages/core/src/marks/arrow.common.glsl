layout(std140) uniform Mark {
    uniform int uHeadShape;

    uniform float uHeadSlope;
    uniform float uHeadNotchSlope;

    uniform float uSizeBand;
    uniform int uSizeReference;
    uniform float uSizeBandReferenceSpan;
    uniform float uMinSize;
    uniform float uHeadWidth;
    uniform bool uStartNotch;
    uniform float uMinStemLength;
    uniform float uHeadSpacing;
    uniform bool uStem;

    uniform int uHeadPlacement;

#pragma markUniforms
};

const int SIZE_REFERENCE_NONE = 0;
const int SIZE_REFERENCE_SCALE_X = 1;
const int SIZE_REFERENCE_SCALE_Y = 2;
const int SIZE_REFERENCE_VIEW_X = 3;
const int SIZE_REFERENCE_VIEW_Y = 4;

const float DIRECTION_FORWARD = 0.0;
const float DIRECTION_REVERSE = 1.0;

const int HEAD_SHAPE_TRIANGLE = 0;
const int HEAD_SHAPE_OPEN = 1;

const int HEAD_PLACEMENT_INSIDE = 0;
const int HEAD_PLACEMENT_OUTSIDE = 1;

// Arrow space uses x for arrow length and y for width perpendicular to it.
// Negative x points toward the arrowhead in the canonical "reverse" direction.
