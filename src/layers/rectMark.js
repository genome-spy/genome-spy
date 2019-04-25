import * as twgl from 'twgl-base.js';
import VERTEX_SHADER from '../gl/rectangle.vertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangle.fragment.glsl';
import { RectVertexBuilder } from '../gl/segmentsToVertices';

import Mark from './mark';

const defaultRenderConfig = {
    minRectWidth: 1.0,
    minRectOpacity: 0.0
};

export default class RectMark extends Mark {
    /**
     * @param {import("./viewUnit").UnitContext} unitContext
     * @param {import("./viewUnit").default} viewUnit
     */
    constructor(unitContext, viewUnit) {
        super(unitContext, viewUnit)
    }

    async initialize() {
        await super.initialize();
    }


    _initGL() {
        const gl = this.gl;

        this.programInfo = twgl.createProgramInfo(gl, [ VERTEX_SHADER, FRAGMENT_SHADER ]);

        const builder = new RectVertexBuilder();
        for (const [sample, rects] of this.specsBySample.entries()) {
            builder.addBatch(sample, rects);
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

        gl.useProgram(this.programInfo.program);
        twgl.setUniforms(this.programInfo, {
            ...globalUniforms,
            uMinWidth: (this.renderConfig.minRectWidth || 1.0) / this.unitContext.sampleTrack.gl.drawingBufferWidth, // How many pixels
            uMinOpacity: this.renderConfig.minRectOpacity || 0.0
        });

        twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);

        for (const sampleData of samples) {
            const range = this.rangeMap.get(sampleData.sampleId);
            if (range) {
                twgl.setUniforms(this.programInfo, sampleData.uniforms);
                twgl.drawBufferInfo(gl, this.bufferInfo, gl.TRIANGLE_STRIP, range.count, range.offset);
            }
        }
    }

    /**
     * @param {string} sampleId 
     * @param {number} pos position on the domain
     */
    findDatum(sampleId, pos) {
        return;
        const rects = this.pointsBySample.get(sampleId);

        // TODO: BinarySearch
        const rect = rects.find(rect => pos >= rect.x && pos < rect.x2);

        return rect ? rect.rawDatum : null;
    }
}