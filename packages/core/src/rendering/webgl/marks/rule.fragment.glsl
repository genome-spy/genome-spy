#ifdef RULE_STROKE
// Dash phase and interval endpoints use logical-pixel coordinates along long rules.
precision highp float;
#endif

// Line ending
const int BUTT = 0;
const int SQUARE = 1;
const int ROUND = 2;

uniform highp sampler2D uDashTexture;

flat in vec4 vColor;
flat in float vSize;
flat in float vBodyFactor;
#ifdef RULE_STROKE
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
// Cap the closest clipped dash using its signed longitudinal distance.
float ribbonDistance(float along, float radius) {
    if (uStrokeCap == ROUND) {
        return length(vec2(max(along, 0.0), vNormalLengthInPixels)) - radius;
    }
    float end = uStrokeCap == SQUARE ? 0.5 * vNominalSize : 0.0;
    vec2 q = vec2(along - end, abs(vNormalLengthInPixels) - radius);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float boundaryCoverage(float along, float outset) {
    float width = vNominalSize + 2.0 * outset;
    float radius = 0.5 * max(width, 1.0 / uDevicePixelRatio) - outset;
    float distance = ribbonDistance(along, radius) - outset;
    return clamp(0.5 - distance * uDevicePixelRatio, 0.0, 1.0) * min(1.0, width * uDevicePixelRatio);
}

vec2 ribbonCoverage(float along) {
    float body = boundaryCoverage(along, 0.0);
    if (vBorderWidth == 0.0) return vec2(body);
    return vec2(body, boundaryCoverage(along, vBorderWidth));
}

vec2 ruleCoverage() {
    vec2 bounds = vec2(0.0, vSpan);
    if (uDashTextureSize == 0.0) {
        return ribbonCoverage(max(-vPosInPixels.x, vPosInPixels.x - vSpan));
    }
    float query = clamp(vPosInPixels.x, bounds.x, bounds.y);
    float local = mod(query + uStrokeDashOffset, uDashTextureSize);
    if (local == uDashTextureSize) local = 0.0;
    vec4 intervals = texelFetch(uDashTexture,
        ivec2(int(floor(local)), uStrokeCap == BUTT ? 1 : 0), 0) + query - fract(local);
    vec2 left = vec2(max(bounds.x, intervals.x), min(bounds.y, intervals.y));
    vec2 right = vec2(max(bounds.x, intervals.z), min(bounds.y, intervals.w));
    bool leftValid = left.x <= left.y && (left.x < left.y || uStrokeCap != BUTT);
    bool rightValid = right.x <= right.y && (right.x < right.y || uStrokeCap != BUTT);
    if (!leftValid && !rightValid) return vec2(0.0);

    float leftAlong = max(left.x - vPosInPixels.x, vPosInPixels.x - left.y);
    float rightAlong = max(right.x - vPosInPixels.x, vPosInPixels.x - right.y);
    float along = leftValid ? leftAlong : rightAlong;
    if (rightValid) along = min(along, rightAlong);

    // Both cap distances are monotone in along. Their minimum gives the coverage
    // union for each boundary, including its independent thin-width compensation.
    return ribbonCoverage(along);
}
#endif

void main(void) {
#ifdef RULE_STROKE
    vec2 coverage = ruleCoverage();
    fragColor = coverage.x * vColor + (coverage.y - coverage.x) * vStroke;
    if (uPickingEnabled) fragColor = vPickingColor;
#else
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
#endif
}
