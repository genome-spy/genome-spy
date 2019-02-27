precision mediump float;

const vec4 white = vec4(vec3(1), 1);
const vec4 black = vec4(vec3(0), 1);

uniform float devicePixelRatio;

varying vec4 vColor;
varying float vSize;

// TODO: Implement more symbols: diamond, triangle, etc
// http://www.iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm

void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));

    if (dist > 0.5)
        discard;

    vec4 strokeColor = mix(vColor, black, 0.3); 
    // Stuble radial gradient
    vec4 fillColor = mix(vColor, white, 0.25 - dist * 0.5);

    // Could use fwidth here, but GL_OES_standard_derivatives is not always available
    float pixelWidth = 1.0 / vSize;
    float strokeWidth = 0.7 * devicePixelRatio * pixelWidth;
    
    float strokeFraction = smoothstep(0.5 - strokeWidth, 0.5 - strokeWidth - pixelWidth, dist);
    float alpha = smoothstep(0.5, 0.5 - pixelWidth, dist);

    gl_FragColor = mix(strokeColor, fillColor, strokeFraction) * alpha;
}