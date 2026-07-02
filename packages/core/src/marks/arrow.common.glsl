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
    uniform int uEndpointMode;

#pragma markUniforms
};
