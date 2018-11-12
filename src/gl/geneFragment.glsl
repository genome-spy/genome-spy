/*
 * This shader renders the gene backbone (mid-line) and arrows that indicate
 * the reading direction (strand).
 */

precision highp float;

varying vec4 vColor;
varying float vYPos;

const float resolution = 15.0; // TODO: Pass as a uniform

const float backboneWidth = 1.0 / resolution;
const float arrowSpacing = 2.0;
const float arrowThickness = 0.9 / (arrowSpacing * resolution);
const float arrowWidth = 0.5;
const float arrowOpacity = 0.3;

const float direction = -1.0;


void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    float c = arrowOpacity * step(abs(vYPos - 0.5) * 2.0, arrowWidth) *
        step(mod(st.x + abs(vYPos - 0.5) * direction, arrowSpacing) / arrowSpacing, arrowThickness);
    
    c += step(abs(vYPos - 0.5) * 2.0, backboneWidth);
    
    c = min(c, 1.0);

    gl_FragColor = vec4(vec3(0.0), c);
}