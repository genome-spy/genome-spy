layout(std140) uniform Mark {
    uniform int uOrient;
    uniform int uDirection;
    uniform int uHeads;
    uniform int uHeadShape;

    uniform float uHeadLength;
    uniform int uHeadLengthUnit;
    uniform float uHeadWidth;
    uniform int uHeadWidthUnit;
    uniform float uStemWidth;
    uniform int uStemWidthUnit;

    uniform int uShortArrow;
    uniform int uHeadPlacement;

#pragma markUniforms
};

const int ORIENT_HORIZONTAL = 0;
const int ORIENT_VERTICAL = 1;

const int DIRECTION_FORWARD = 0;
const int DIRECTION_REVERSE = 1;

const int HEADS_END = 0;
const int HEADS_START = 1;
const int HEADS_BOTH = 2;
const int HEADS_NONE = 3;

const int HEAD_SHAPE_TRIANGLE = 0;
const int HEAD_SHAPE_ANGLE = 1;
const int HEAD_SHAPE_STEALTH = 2;

const int UNIT_PX = 0;
const int UNIT_PROPORTION = 1;

const int SHORT_ARROW_SHRINK_HEAD = 0;
const int SHORT_ARROW_TRIANGLE = 1;
const int SHORT_ARROW_HIDE = 2;

const int HEAD_PLACEMENT_INSIDE = 0;
const int HEAD_PLACEMENT_OUTSIDE = 1;
