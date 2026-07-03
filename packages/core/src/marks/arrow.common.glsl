layout(std140) uniform Mark {
    uniform int uOrient;
    uniform int uDirection;
    uniform int uHeadShape;

    uniform float uHeadSlope;
    uniform float uHeadNotchSlope;

    uniform float uHeadWidth;
    uniform int uHeadWidthUnit;
    uniform bool uStartNotch;
    uniform float uMinStemLength;
    uniform bool uHeadRepeat;
    uniform float uHeadSpacing;
    uniform float uStemWidth;
    uniform int uStemWidthUnit;

    uniform int uHeadPlacement;

#pragma markUniforms
};

const int ORIENT_HORIZONTAL = 0;
const int ORIENT_VERTICAL = 1;

const int DIRECTION_FORWARD = 0;
const int DIRECTION_REVERSE = 1;

const int HEAD_SHAPE_TRIANGLE = 0;
const int HEAD_SHAPE_ANGLE = 1;

const int UNIT_PX = 0;
const int UNIT_PROPORTION = 1;

const int HEAD_PLACEMENT_INSIDE = 0;
const int HEAD_PLACEMENT_OUTSIDE = 1;

// Arrow space uses x for arrow length and y for width perpendicular to it.
// Negative x points toward the arrowhead in the canonical "reverse" direction.
vec2 toArrowSpace(vec2 v) {
    return uOrient == ORIENT_HORIZONTAL ? v : v.yx;
}
