precision mediump float;

const lowp vec3 white = vec3(1.0);
const lowp vec3 black = vec3(0.0);

uniform lowp float devicePixelRatio;

varying lowp vec4 vColor;
varying float vSize;

// TODO: Implement more symbols: diamond, triangle, etc
// http://www.iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm

void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));

    if (dist > 0.5)
        discard;

    lowp vec3 strokeColor = mix(vColor.rgb, black, 0.3); 
    // Stuble radial gradient
    lowp vec3 fillColor = mix(vColor.rgb, white, 0.25 - dist * 0.5);

    // Could use fwidth here, but GL_OES_standard_derivatives is not always available
    float pixelWidth = 1.0 / vSize;
    float strokeWidth = 0.7 * devicePixelRatio * pixelWidth;
    
    lowp float strokeFraction = smoothstep(0.5 - strokeWidth, 0.5 - strokeWidth - pixelWidth, dist);
    lowp float alpha = smoothstep(0.5, 0.5 - pixelWidth, dist) * vColor.a;

    gl_FragColor = vec4(mix(strokeColor, fillColor, strokeFraction) * alpha, alpha);
}