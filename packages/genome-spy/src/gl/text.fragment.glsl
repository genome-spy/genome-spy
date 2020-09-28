uniform sampler2D uTexture;

varying vec2 vTexCoord;
varying vec4 vColor;
varying float vSlope;

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

void main() {
    vec3 c = texture2D(uTexture, vTexCoord).rgb;

    float sigDist = 1.0 -  median(c.r, c.g, c.b);
    float opa = clamp((sigDist - 0.5) * vSlope + 0.5, 0.0, 1.0);
    gl_FragColor = vColor * opa;
}
