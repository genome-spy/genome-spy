import * as twgl from 'twgl-base.js';
import VERTEX_SHADER from '../gl/rectangle.vertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangle.fragment.glsl';
import { rectsToVertices, verticesToVertexData } from '../gl/segmentsToVertices';

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

        this.bufferInfos = new Map();

        for (let [sample, rects] of this.specsBySample.entries()) {
            rects = rects.filter(p => p.x2 > p.x && p.y2 > p.y && p.opacity !== 0);
            if (rects.length) {
                const vertexData = rectsToVertices(rects);
                this.bufferInfos.set(sample, twgl.createBufferInfoFromArrays(this.gl, vertexData.arrays));
            }
        }

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

        for (const sampleData of samples) {
            const bufferInfo = this.bufferInfos.get(sampleData.sampleId);
            if (!bufferInfo) {
                // TODO: Log if debug-mode or something
                continue;
            }

            twgl.setBuffersAndAttributes(gl, this.programInfo, bufferInfo)
            twgl.setUniforms(this.programInfo, {
                ...sampleData.uniforms,
            });

            twgl.drawBufferInfo(gl, bufferInfo, gl.TRIANGLE_STRIP);
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