flat in lowp vec4 vColor;

out lowp vec4 fragColor;

void main(void) {
    fragColor = vColor;

    if (uPickingEnabled) {
        fragColor = vPickingColor;
    }
}
