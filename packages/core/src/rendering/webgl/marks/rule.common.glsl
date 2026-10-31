layout(std140) uniform Mark {
    /** Minimum rule length in pixels */
    uniform mediump float uMinLength;

    uniform mediump float uDashTextureSize;
    uniform lowp int uStrokeCap;
    uniform mediump float uStrokeDashOffset;
    uniform lowp vec3 uOutlineColor;
    uniform mediump float uOutlineWidth;

#pragma markUniforms
};
