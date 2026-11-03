// Line ending
const int BUTT = 0;
const int SQUARE = 1;
const int ROUND = 2;

uniform sampler2D uDashTexture;

flat in vec4 vColor;
flat in float vSize;
flat in float vBodyFactor;
#ifdef RULE_STROKE
uniform sampler2D uDashIntervals;
flat in vec4 vStroke;
flat in float vBorderWidth;
flat in float vNominalSize;
flat in float vSpan;
#endif

/** Position on the rule along its length in pixels */
in highp vec2 vPosInPixels;
in float vNormalLengthInPixels;

out lowp vec4 fragColor;

#ifdef RULE_STROKE
// Distance to the finite ribbon intersected with one painted dash interval.
float ribbonDistance(vec2 interval, float radius) {
    vec2 p = vec2(vPosInPixels.x, vNormalLengthInPixels);
    vec2 nearest = vec2(clamp(p.x, interval.x, interval.y), clamp(p.y, -radius, radius));
    float interior = min(radius - abs(p.y), min(p.x - interval.x, interval.y - p.x));
    if (uStrokeCap == ROUND) {
        vec2 center = vec2(clamp(p.x, 0.0, vSpan), 0.0);
        vec2 v = p - center;
        float d = length(v);
        nearest = p;
        if (d > radius) nearest = center + v * (radius / d);
        nearest.x = clamp(nearest.x, interval.x, interval.y);
        float capX = max(-nearest.x, max(nearest.x - vSpan, 0.0));
        float height = sqrt(max(0.0, radius * radius - capX * capX));
        nearest.y = clamp(p.y, -height, height);
        interior = min(radius - d, min(p.x - interval.x, interval.y - p.x));
    }
    return interior >= 0.0 ? -interior : length(p - nearest);
}

float boundaryCoverage(vec2 interval, float outset) {
    float width = vNominalSize + 2.0 * outset;
    float radius = 0.5 * max(width, 1.0 / uDevicePixelRatio) - outset;
    float distance = ribbonDistance(interval, radius) - outset;
    return clamp(0.5 - distance * uDevicePixelRatio, 0.0, 1.0) * min(1.0, width * uDevicePixelRatio);
}

vec2 intervalCoverage(vec2 interval) {
    if (interval.x >= interval.y) return vec2(0.0);
    return vec2(boundaryCoverage(interval, 0.0), boundaryCoverage(interval, vBorderWidth));
}

vec2 ruleCoverage() {
    float end = uStrokeCap == BUTT ? 0.0 : vSize * 0.5;
    vec2 bounds = vec2(-end, vSpan + end);
    if (uDashTextureSize == 0.0) return intervalCoverage(bounds);
    vec2 p = vec2(vPosInPixels.x, vNormalLengthInPixels);
    float query = clamp(p.x, bounds.x, bounds.y);
    if (uStrokeCap == ROUND) {
        vec2 center = vec2(clamp(p.x, 0.0, vSpan), 0.0);
        vec2 v = p - center;
        if (length(v) > vSize * 0.5) query = (center + normalize(v) * vSize * 0.5).x;
    }
    float local = mod(query + uStrokeDashOffset, uDashTextureSize);
    vec4 intervals = texelFetch(uDashIntervals, ivec2(int(floor(local)), 0), 0) + query - fract(local);
    return max(intervalCoverage(vec2(max(bounds.x, intervals.x), min(bounds.y, intervals.y))),
        intervalCoverage(vec2(max(bounds.x, intervals.z), min(bounds.y, intervals.w))));
}
#endif

void main(void) {
#ifdef RULE_STROKE
    if (vBorderWidth > 0.0) {
        vec2 coverage = ruleCoverage();
        fragColor = coverage.x * vColor + (coverage.y - coverage.x) * vStroke;
        if (uPickingEnabled) fragColor = vPickingColor;
        return;
    }
#endif
    float dpr = uDevicePixelRatio;

    float distanceFromEnd = -min(vPosInPixels[0], vPosInPixels[1]);
    float distance; // from the rule centerline or end
    if (distanceFromEnd > 0.0 && uStrokeCap == ROUND) {
        // round cap
        distance = length(vec2(distanceFromEnd, vNormalLengthInPixels));
    } else {
        distance = abs(vNormalLengthInPixels);
    }

    // Use a signed distance field to implement edge antialiasing
    float opacity = clamp(((vSize / 2.0 - distance) * dpr), -0.5, 0.5) + 0.5;

    if (uDashTextureSize > 0.0) {
        highp float pos = (vPosInPixels[0] + uStrokeDashOffset) * dpr;
        highp float floored = floor(pos);
        vec2 texelPositions = (floored + vec2(0.5, 1.5)) / dpr / uDashTextureSize;
      
        // Do antialiasing
        opacity *= mix(
            texture(uDashTexture, vec2(texelPositions[0], 0)).r,
            texture(uDashTexture, vec2(texelPositions[1], 0)).r,
            clamp((pos - floored), 0.0, 1.0));
    }

    fragColor = vColor * opacity * vBodyFactor;

    if (uPickingEnabled) {
        fragColor = vPickingColor;
    }
}
