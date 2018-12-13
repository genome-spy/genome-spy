/*
 * This shader renders the gene backbone (mid-line) and arrows that indicate
 * the reading direction (strand).
 */

precision highp float;

varying vec4 vColor;
varying float vYPos;

uniform float uResolution; //  = 15.0; // TODO: Pass as a uniform

const float arrowSpacing = 2.0;
const float arrowWidth = 0.5;
const float arrowOpacity = 0.4;

const float direction = -1.0;


void main() {
    float backboneWidth = 1.0 / uResolution;
    float arrowThickness = 0.9 / (arrowSpacing * uResolution);

    vec2 st = gl_FragCoord.xy / uResolution;

    float c = arrowOpacity * step(abs(vYPos - 0.5) * 2.0, arrowWidth) *
        step(mod(st.x + abs(vYPos - 0.5) * direction, arrowSpacing) / arrowSpacing, arrowThickness);
    
    c += step(abs(vYPos - 0.5) * 2.0, backboneWidth);
    
    c = min(c, 1.0);

    gl_FragColor = vec4(vec3(0.0), c);
}