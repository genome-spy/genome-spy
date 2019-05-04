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

        // Needs blending or not. TODO: Make handling of defaults more systematic
        const opacity = viewUnit.getEncoding().opacity;
        this.opaque = !opacity || opacity.value >= 1.0;
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

        if (this.opaque) {
            gl.disable(gl.BLEND);
        } else {
            gl.enable(gl.BLEND);
        }

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
     * @param {number} x position on the viewport
     * @param {number} y position on the viewport
     * @param {import("../utils/interval").default} yBand the matched band on the band scale
     */
    findDatum(sampleId, x, y, yBand) {
        const rects = this.specsBySample.get(sampleId);

        const scaledX = this.unitContext.genomeSpy.rescaledX.invert(x);

        // TODO: Needs work when proper scales are added to the y axis
        const scaledY = 1 - (y - yBand.lower) / yBand.width();

        const rect = rects.find(rect =>
             scaledX >= rect.x && scaledX < rect.x2 &&
             scaledY >= rect.y && scaledY < rect.y2);

        return rect;
    }
}