in lowp vec4 vColor;
in float vSize;
in float vNormalLengthInPixels;

out lowp vec4 fragColor;

void main(void) {
    float dpr = uDevicePixelRatio;

    float distance = abs(vNormalLengthInPixels);
    float opacity = clamp(((vSize / 2.0 - distance) * dpr), 0.0, 1.0);

    fragColor = vColor * opacity;
}
