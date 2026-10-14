flat in vec4 vColor;
flat in vec4 vOrthogonalEndpoints;
flat in int vOrthogonalPart;
in vec2 vOrthogonalPosition;
flat in float vSize;
in float vNormalLengthInPixels;
flat in float vGamma;
in float vFadeDistance;

out lowp vec4 fragColor;

void main(void) {
    float dpr = uDevicePixelRatio;

    float distance = abs(vNormalLengthInPixels);
    float opacity = clamp(((vSize / 2.0 - distance) * dpr), 0.0, 1.0);

    if (uShape == SHAPE_ORTHOGONAL) {
        float nearest = 1e20;
        float coverageDistance = 1e20;
        int owner = 0;
        for (int part = 0; part < 4; part++) {
            float d = orthogonalDistance(vOrthogonalPosition,
                orthogonalBounds(part, vOrthogonalEndpoints.xy, vOrthogonalEndpoints.zw, vSize * 0.5));
            if (part < 3 && d < nearest) { nearest = d; owner = part; }
            coverageDistance = min(coverageDistance, d);
        }
        // Only one quad shades a pixel, including where short legs overlap.
        if (owner != vOrthogonalPart) discard;
        opacity = clamp((uPickingEnabled ? 0.0 : 0.5) - coverageDistance * dpr, 0.0, 1.0);
    }
    opacity = pow(opacity, vGamma);

    if (vFadeDistance >= 0.0) {
        opacity *= 1.0 - smoothstep(uArcFadingDistance[0], uArcFadingDistance[1], vFadeDistance);
    }
    if (opacity <= 0.0) {
        discard;
    }

    fragColor = vColor * opacity;

    if (uPickingEnabled) {
        fragColor = vPickingColor;
    }
}
