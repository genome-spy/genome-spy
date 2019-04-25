import * as twgl from 'twgl-base.js';
import { PointVertexBuilder } from '../gl/segmentsToVertices';
import VERTEX_SHADER from '../gl/point.vertex.glsl';
import FRAGMENT_SHADER from '../gl/point.fragment.glsl';

import ViewUnit from './viewUnit';
import Mark from './mark';


// TODO: Style object
const maxPointSizeRelative = 0.8;
const maxPointSizeAbsolute = 25;

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
    }

    /**
     * @param {object[]} samples 
     * @param {object} globalUniforms 
     */
    render(samples, globalUniforms) {
        const gl = this.gl;

        gl.useProgram(this.programInfo.program);
        twgl.setUniforms(this.programInfo, {
            ...globalUniforms,
            viewportHeight: this.unitContext.sampleTrack.glCanvas.clientHeight * window.devicePixelRatio,
            devicePixelRatio: window.devicePixelRatio,
            maxPointSizeRelative,
            maxPointSizeAbsolute: maxPointSizeAbsolute * window.devicePixelRatio,
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

        const maxPointSize = Math.min(maxPointSizeAbsolute, maxPointSizeRelative * yBand.width());

        const distance = (x1, x2, y1, y2) => Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        const scale = this.unitContext.sampleTrack.genomeSpy.rescaledX;

        let lastMatch = null;
        for (const point of points) {
            const dist = distance(x, scale(point.x), y, pointY);
            if (dist < maxPointSize * point.size) {
                lastMatch = point;
            }
        }

        return lastMatch;
    }
}
