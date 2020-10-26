uniform sampler2D uTexture;

in vec2 vTexCoord;
in vec4 vColor;
in float vSlope;
in float vEdgeFadeOpacity;

out lowp vec4 fragColor;

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

void main() {
    vec3 c = texture(uTexture, vTexCoord).rgb;

    float sigDist = 1.0 - median(c.r, c.g, c.b);
    float opa = clamp((sigDist - 0.5) * vSlope + 0.5, 0.0, 1.0);

    // Raise to the power of 2.2 to do some cheap gamma correction
    opa *= pow(clamp(vEdgeFadeOpacity, 0.0, 1.0), 2.2);

    fragColor = vColor * opa;
}
