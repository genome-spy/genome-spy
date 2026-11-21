uniform vec2 uTarget;
uniform vec2 uAnchorPixel;
uniform ivec2 uAnchorCell;
uniform vec2 uCellsPerPixel;
uniform float uOpacity;

out vec4 fragColor;

void main() {
    vec2 pixel = vec2(gl_FragCoord.x, uTarget.y - gl_FragCoord.y);
    vec2 center = (pixel - uAnchorPixel) * uCellsPerPixel;
    ivec2 cell = clamp(uAnchorCell + ivec2(floor(center)), ivec2(0), textureSize(uCells, 0) - 1);
    vec4 color = cellColor(cell);
    fragColor = vec4(color.rgb * color.a, color.a) * uOpacity;
}
