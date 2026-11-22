uniform vec2 uTarget;
uniform vec4 uAnchor; // Pixel coordinates in xy, cell indices in zw.
uniform vec2 uCellsPerPixel;
uniform float uOpacity;
uniform vec2 uTriangle;
uniform vec4 uTriangleClip;

out vec4 fragColor;

ivec2 cellAt(vec2 offset, ivec2 lastCell) {
    return clamp(ivec2(uAnchor.zw) + ivec2(floor(offset)), ivec2(0), lastCell);
}

vec4 sampleCell(ivec2 cell) {
    vec4 color = cellColor(cell);
#ifdef RASTER_CELL_OPACITY
    color.a *= texelFetch(uCellOpacity, cell, 0).r;
#endif
    return vec4(color.rgb * color.a, color.a);
}

vec4 sampleRow(ivec2 firstCell, int secondColumn, float weight) {
    vec4 first = sampleCell(firstCell);
    if (firstCell.x == secondColumn) return first;
    return mix(first, sampleCell(ivec2(secondColumn, firstCell.y)), weight);
}

void main() {
    vec2 pixel = vec2(gl_FragCoord.x, uTarget.y - gl_FragCoord.y);
    ivec2 lastCell = textureSize(uCells, 0) - 1;
    if (uTriangle.y != 0.0) {
        if (any(lessThan(pixel, uTriangleClip.xy)) || any(greaterThanEqual(pixel, uTriangleClip.zw))) discard;
        float separation = (pixel.y - uTriangle.x) * uTriangle.y;
        vec2 source = pixel.x + vec2(separation, -separation);
        fragColor = sampleCell(cellAt((source - uAnchor.xy) * uCellsPerPixel, lastCell)) * uOpacity;
        return;
    }
    vec2 center = (pixel - uAnchor.xy) * uCellsPerPixel;
    vec2 width = abs(uCellsPerPixel);

    // Split each pixel footprint at the nearest grid line and sample each
    // piece at its midpoint. Equal texel coordinates collapse to one fetch.
    vec2 weight = clamp(0.5 + (center - round(center)) / width, 0.0, 1.0);
    vec2 halfWidth = 0.5 * width;
    ivec2 first = cellAt(center - halfWidth * weight, lastCell);
    ivec2 second = cellAt(center + halfWidth * (1.0 - weight), lastCell);

    vec4 shaded = sampleRow(first, second.x, weight.x);
    if (first.y != second.y) {
        shaded = mix(shaded, sampleRow(ivec2(first.x, second.y), second.x, weight.x), weight.y);
    }
    fragColor = shaded * uOpacity;
}
