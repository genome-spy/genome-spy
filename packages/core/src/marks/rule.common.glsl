layout(std140) uniform Mark {
    /** Minimum rule length in pixels */
    uniform mediump float uMinLength;

    uniform mediump float uDashTextureSize;
    uniform lowp int uStrokeCap;
    uniform lowp int uTickMode;
    uniform lowp int uTickOrient;
    uniform mediump float uTickLength;
    uniform mediump float uStrokeDashOffset;

#pragma markUniforms
};
