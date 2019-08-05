
uniform highp float uYDomainBegin;
uniform highp float uYDomainWidth;

uniform float uYOffset;

attribute highp float y;

/**
 * Does viewport (track) transformation and returns the Y coordinate on normalized [0, 1] scale
 */
float normalizeY() {
    return (y - uYDomainBegin) / uYDomainWidth + uYOffset;
}