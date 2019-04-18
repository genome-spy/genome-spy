
import { Program, assembleShaders, fp64 } from 'luma.gl';
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

        this.segmentProgram = new Program(gl, assembleShaders(gl, {
            vs: VERTEX_SHADER,
            fs: FRAGMENT_SHADER,
            modules: ['fp64']
        }));

        this.vertexDatas = new Map();

        for (let [sample, rects] of this.specsBySample.entries()) {
            rects = rects.filter(p => p.x2 > p.x && p.y2 > p.y && p.opacity !== 0);
            if (rects.length) {
                this.vertexDatas.set(
                    sample,
                    verticesToVertexData(this.segmentProgram, rectsToVertices(rects)));
            }
        }

        this.renderConfig = Object.assign({}, defaultRenderConfig, this.viewUnit.getRenderConfig());
    }

    /**
     * @param {string} sampleId 
     * @param {object} uniforms 
     */
    render(sampleId, uniforms) {
        const vertices = this.vertexDatas.get(sampleId);
        if (!vertices) {
            // TODO: Log if debug-mode or something
            return;
        }

        this.segmentProgram.setUniforms({
            ...uniforms,
            ...fp64.getUniforms(),
            uMinWidth: (this.renderConfig.minRectWidth || 1.0) / this.unitContext.sampleTrack.gl.drawingBufferWidth, // How many pixels
            uMinOpacity: this.renderConfig.minRectOpacity || 0.0
        });
        this.segmentProgram.draw({
            ...vertices,
            uniforms: null // Explicityly specify null to prevent erroneous deprecation warning
        });
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