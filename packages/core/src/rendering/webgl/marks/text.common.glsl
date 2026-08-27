layout(std140) uniform Mark {
    uniform mediump float uSdfNumerator;

    uniform mediump vec2 uD; // dx & dy

    uniform mediump vec4 uViewportEdgeFadeWidth;
    uniform mediump vec4 uViewportEdgeFadeDistance;
        
    uniform bool uSqueeze;
    uniform bool uLogoLetter;

    // x: -1, 0, 1 = left, center, right
    // y: -1, 0, 1 = top, middle, bottom 
    uniform lowp ivec2 uAlign;

    uniform mediump float uPaddingX;
    uniform bool uFlushX;
    uniform mediump float uPaddingY;
    uniform bool uFlushY;

#pragma markUniforms
};
