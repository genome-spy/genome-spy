in vec2 vPosInPixels;

flat in vec2 vHalfSizeInPixels;
flat in lowp vec4 vFillColor;
flat in lowp vec4 vStrokeColor;
flat in float vHalfStrokeWidth;

out lowp vec4 fragColor;

float sdSharpBox(vec2 p, vec2 b) {
    vec2 q = abs(p) - b;
    return max(q.x, q.y);
}

void main(void) {
    float d = sdSharpBox(vPosInPixels, vHalfSizeInPixels);

    fragColor = distanceToColor(
        d,
        vFillColor,
        vStrokeColor,
        vec4(0.0),
        vHalfStrokeWidth
    );

    if (uPickingEnabled) {
        if (d < vHalfStrokeWidth) {
            fragColor = vPickingColor;
        }
    } else if (fragColor.a == 0.0) {
        discard;
    }
}
