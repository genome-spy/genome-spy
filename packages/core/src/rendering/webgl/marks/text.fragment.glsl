uniform sampler2D uTexture;

in vec2 vTexCoord;
in vec2 vUnitPos;
flat in vec4 vColor;
flat in float vSlope;
flat in float vGamma;

out lowp vec4 fragColor;

float minValue(vec4 v) {
    return min(min(v.x, v.y), min(v.z, v.w));
}

float maxValue(vec4 v) {
    return max(max(v.x, v.y), max(v.z, v.w));
}

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

float getDist(vec2 uv) {
    vec3 c = texture(uTexture, uv).rgb;
    return 1.0 - median(c.r, c.g, c.b);
}

/**
 * Calculates the super-sampled distance to the edge.
 * This is used to avoid aliasing when rendering small text,
 * as mip-mapping cannot be used here.
 * The distance is averaged over a grid of n x n samples.
 */
float getSuperDist(vec2 uv) {
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);

    float n = 2.0;

    float sum = 0.0;
    for (float x = 0.5; x < n; x++){
        for (float y = 0.5; y < n; y++) {
            sum += getDist(
                uv +
                x / n * dx +
                y / n * dy
            ); 
        }
    }

    return sum / (n * n);
}

void main() {
    float sigDist = getSuperDist(vTexCoord);

    float slope = vSlope;
    if (uLogoLetter) {
        // Using screen-space derivatives for logo letters because skewed aspect ratios
        // result in blurry edges otherwise. However, use of screen-space derivatives
        // results in crappy looking text with regular letters text.
        slope = 0.7 / length(vec2(dFdy(sigDist), dFdx(sigDist)));
    }

    float opa = clamp((sigDist - 0.5) * slope + 0.5, 0.0, 1.0);
    // Evaluate opposing viewport fades per fragment so central ink stays visible.
    if (maxValue(uViewportEdgeFadeDistance) > -1e10) {
        float fade = minValue(
            ((vec4(1.0, 1.0, 0.0, 0.0) + vec4(-1.0, -1.0, 1.0, 1.0) * vUnitPos.yxyx) *
                uViewportSize.yxyx - uViewportEdgeFadeDistance) / uViewportEdgeFadeWidth);
        opa *= clamp(fade, 0.0, 1.0);
    }

    opa = pow(opa, vGamma);

    fragColor = vColor * opa;

    if (uPickingEnabled) {
        fragColor = vPickingColor;
    }
}
