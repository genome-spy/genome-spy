layout(std140) uniform Mark {
    /** Minimum rule length in pixels */
    uniform mediump float uMinLength;

    uniform highp float uDashTextureSize;
    uniform lowp int uStrokeCap;
    uniform lowp int uStrokeAlign;
    uniform highp float uStrokeDashOffset;

#pragma markUniforms
};
