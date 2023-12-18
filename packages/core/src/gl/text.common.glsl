    uniform float uSdfNumerator;

    uniform vec2 uD; // dx & dy

    uniform vec4 uViewportEdgeFadeWidth;
    uniform vec4 uViewportEdgeFadeDistance;
        
    uniform bool uSqueeze;
    uniform bool uLogoLetter;

    // x: -1, 0, 1 = left, center, right
    // y: -1, 0, 1 = top, middle, bottom 
    uniform ivec2 uAlign;

    uniform float uPaddingX;
    uniform bool uFlushX;
    uniform float uPaddingY;
    uniform bool uFlushY;
