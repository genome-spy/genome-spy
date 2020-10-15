// Line ending
const int BUTT = 0;
const int SQUARE = 1;
const int ROUND = 2;

uniform sampler2D uDashTexture;
uniform float uDashTextureSize;
uniform float uStrokeDashOffset;
uniform float uStrokeCap;

varying vec4 vColor;
varying float vSize;
varying vec2 vPosInPixels;
varying float vNormalLengthInPixels;

void main(void) {
    float dpr = uDevicePixelRatio;

    int lineCap = int(uStrokeCap);

    float distanceFromEnd = -min(vPosInPixels[0], vPosInPixels[1]);
    float distance; // from the rule centerline or end
    if (distanceFromEnd > 0.0 && lineCap == ROUND) {
        // round cap
        distance = length(vec2(distanceFromEnd, vNormalLengthInPixels));
    } else {
        // edge aa
        distance = abs(vNormalLengthInPixels);
    }

    float opacity = clamp(((vSize / 2.0 - distance) * dpr), -0.5, 0.5) + 0.5;

    if (uDashTextureSize > 0.0) {
        float pos = (vPosInPixels[0] + uStrokeDashOffset) * dpr;
        float floored = floor(pos);
      
        // Do antialiasing
        opacity *= mix(
            texture2D(uDashTexture, vec2((floored + 0.5) / dpr / uDashTextureSize, 0)).r,
            texture2D(uDashTexture, vec2((floored + 1.5) / dpr / uDashTextureSize, 0)).r,
            clamp((pos - floored), 0.0, 1.0));
    }

    gl_FragColor = vColor * opacity;
}
