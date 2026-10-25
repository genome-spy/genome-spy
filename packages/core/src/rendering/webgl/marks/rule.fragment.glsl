// Line ending
const int BUTT = 0;
const int SQUARE = 1;
const int ROUND = 2;

uniform sampler2D uDashTexture;

flat in vec4 vColor;
flat in float vSize;
flat in float vOuterSize;

/** Position on the rule along its length in pixels */
in highp vec2 vPosInPixels;
in float vNormalLengthInPixels;

out lowp vec4 fragColor;

void main(void) {
    float dpr = uDevicePixelRatio;

    float distanceFromEnd = -min(vPosInPixels[0], vPosInPixels[1]);
    float distance; // from the rule centerline or end
    if (distanceFromEnd > 0.0 && uStrokeCap == ROUND) {
        // round cap
        distance = length(vec2(distanceFromEnd, vNormalLengthInPixels));
    } else {
        distance = abs(vNormalLengthInPixels);
    }

    // Use a signed distance field to implement edge antialiasing
    float opacity = clamp(((vOuterSize / 2.0 - distance) * dpr), -0.5, 0.5) + 0.5;
    vec4 color = vColor;
    if (uOutlineWidth > 0.0 && opacity > 0.0) {
        float innerDistance = uStrokeCap == SQUARE
            ? max(abs(vNormalLengthInPixels), distanceFromEnd)
            : distance;
        float inner = min(opacity, clamp((vSize / 2.0 - innerDistance) * dpr + 0.5, 0.0, 1.0));
        // Mix disjoint coverage so translucent rules do not paint themselves twice.
        color = mix(vec4(uOutlineColor * vColor.a, vColor.a), vColor, inner / opacity);
    }

    if (uDashTextureSize > 0.0) {
        highp float pos = (vPosInPixels[0] + uStrokeDashOffset) * dpr;
        highp float floored = floor(pos);
        vec2 texelPositions = (floored + vec2(0.5, 1.5)) / dpr / uDashTextureSize;
      
        // Do antialiasing
        opacity *= mix(
            texture(uDashTexture, vec2(texelPositions[0], 0)).r,
            texture(uDashTexture, vec2(texelPositions[1], 0)).r,
            clamp((pos - floored), 0.0, 1.0));
    }

    fragColor = color * opacity;

    if (uPickingEnabled) {
        if (uOutlineWidth > 0.0 && opacity <= 0.0) discard;
        fragColor = vPickingColor;
    }
}
