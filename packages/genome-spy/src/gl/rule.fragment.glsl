precision mediump float;

uniform sampler2D uDashTexture;
uniform float uDashTextureSize;
uniform float uStrokeDashOffset;
uniform float uDevicePixelRatio;

varying vec4 vColor;
varying float vPixelPos;

void main(void) {
    if (uDashTextureSize > 0.0) {
        float dpr = uDevicePixelRatio;
        float pos = (vPixelPos + uStrokeDashOffset) * dpr;
        float floored = floor(pos);
      
        // Do antialiasing
        float opacity = mix(
            texture2D(uDashTexture, vec2(floored / dpr / uDashTextureSize, 0)).r,
            texture2D(uDashTexture, vec2((floored + 1.0) / dpr / uDashTextureSize, 0)).r,
            clamp((pos - floored), 0.0, 1.0));

        gl_FragColor = vColor * opacity;

    } else {
        gl_FragColor = vColor;
    }
}
