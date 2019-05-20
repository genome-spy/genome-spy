import * as twgl from 'twgl-base.js';
import { PointVertexBuilder } from '../gl/segmentsToVertices';
import VERTEX_SHADER from '../gl/point.vertex.glsl';
import FRAGMENT_SHADER from '../gl/point.fragment.glsl';

import ViewUnit from './viewUnit';
import Mark from './mark';


// TODO: Style object
const defaultRenderConfig = {
    // Fraction of sample height
    maxPointSizeRelative: 0.8,
    // In pixels
    maxMaxPointSizeAbsolute: 25,
    // In pixels
    minMaxPointSizeAbsolute: 4.5
}

const fractionToShow = 0.02;

export default class PointMark extends Mark {
    /**
     * @param {import("./viewUnit").UnitContext} unitContext
     * @param {import("./viewUnit").default} viewUnit
     */
    constructor(unitContext, viewUnit) {
        super(unitContext, viewUnit)
    }

    async initialize() {
        await super.initialize();

        this._initGL();
    }


    _initGL() {
        const gl = this.gl;

        this.programInfo = twgl.createProgramInfo(gl, [ VERTEX_SHADER, FRAGMENT_SHADER ]);


        const builder = new PointVertexBuilder();
        for (const [sample, points] of this.specsBySample.entries()) {
            builder.addBatch(sample, points);
        }
        const vertexData = builder.toArrays();

        this.rangeMap = vertexData.rangeMap;
        this.bufferInfo = twgl.createBufferInfoFromArrays(this.gl, vertexData.arrays);

        this.renderConfig = Object.assign({}, defaultRenderConfig, this.viewUnit.getRenderConfig());
    }

    /**
     * @param {object[]} samples 
     * @param {object} globalUniforms 
     */
    render(samples, globalUniforms) {
        const gl = this.gl;

        gl.enable(gl.BLEND);
        gl.useProgram(this.programInfo.program);
        twgl.setUniforms(this.programInfo, {
            ...globalUniforms,
            viewportHeight: this.unitContext.sampleTrack.glCanvas.clientHeight,
            devicePixelRatio: window.devicePixelRatio,
            maxPointSizeRelative: this.renderConfig.maxPointSizeRelative,
            maxMaxPointSizeAbsolute: this.renderConfig.maxMaxPointSizeAbsolute,
            minMaxPointSizeAbsolute: this.renderConfig.minMaxPointSizeAbsolute,
            fractionToShow: fractionToShow // TODO: Configurable
        });

        twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);

        for (const sampleData of samples) {
            const range = this.rangeMap.get(sampleData.sampleId);
            if (range) {
                twgl.setUniforms(this.programInfo, sampleData.uniforms);
                twgl.drawBufferInfo(gl, this.bufferInfo, gl.POINTS, range.count, range.offset);
            }
        }
    }

    /**
     * @param {string} sampleId 
     * @param {number} x position on the viewport
     * @param {number} y position on the viewport
     * @param {import("../utils/interval").default} yBand the matched band on the band scale
     */
    findDatum(sampleId, x, y, yBand) {
        const points = this.specsBySample.get(sampleId);
        if (!points) {
            return null;
        }

        const pointY = yBand.centre();

        const maxPointSize = Math.max(
            this.renderConfig.minMaxPointSizeAbsolute,
            Math.min(this.renderConfig.maxMaxPointSizeAbsolute, this.renderConfig.maxPointSizeRelative * yBand.width()));

        const distance = (x1, x2, y1, y2) => Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        const scale = this.unitContext.sampleTrack.genomeSpy.rescaledX;

        const margin = 0.005; // TODO: Configurable
        const threshold = this.unitContext.genomeSpy.getExpZoomLevel() * fractionToShow;
        const thresholdWithMargin = threshold * (1 + margin);

        let lastMatch = null;
        for (const point of points) {
            if (1 - point.zoomThreshold < thresholdWithMargin) {
                const dist = distance(x, scale(point.x), y, pointY);
                if (dist < maxPointSize * point.size) {
                    lastMatch = point;
                }
            }
        }

        return lastMatch;
    }
}



/**
 * https://www.wikiwand.com/en/Smoothstep
 * 
 * @param {number} edge0 
 * @param {number} edge1
 * @param {number} x
 */
function smoothstep(edge0, edge1, x) {
    // Scale, bias and saturate x to 0..1 range
    x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    // Evaluate polynomial
    return x * x * (3 - 2 * x);
}

/**
 * 
 * @param {number} x 
 * @param {number} lowerlimit 
 * @param {number} upperlimit 
 */
function clamp(x, lowerlimit, upperlimit) {
    if (x < lowerlimit)
        x = lowerlimit;
    if (x > upperlimit)
        x = upperlimit;
    return x;
}