uniform sampler2D uTexture;

in vec2 vTexCoord;
in float vEdgeFadeOpacity;
in vec4 vColor;
in float vSlope;

out lowp vec4 fragColor;

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

void main() {
    // TODO: Really small text should fall back to normal (non-SDF) texture that can be mip-mapped.
    // Currently small text has severe aliasing artifacts.

    vec3 c = texture(uTexture, vTexCoord).rgb;

    float sigDist = 1.0 - median(c.r, c.g, c.b);

    // Using screen-space derivatives for logo letters because skewed aspect ratios
    // result in blurry edges otherwise. However, use of screen-space derivatives
    // results in crappy looking text with regular letters text.
    float slope = uLogoLetter
        ? 0.7 / length(vec2(dFdy(sigDist), dFdx(sigDist)))
        : vSlope;

    float opa = clamp((sigDist - 0.5) * slope + 0.5, 0.0, 1.0);

    // Raise to the power of 2.2 to do some cheap gamma correction
    opa *= pow(clamp(vEdgeFadeOpacity, 0.0, 1.0), 2.2);

    fragColor = vColor * opa;

    if (uPickingEnabled) {
        fragColor = vPickingColor;
    }
}
