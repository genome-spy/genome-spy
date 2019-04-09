
import { Program, assembleShaders, fp64 } from 'luma.gl';
import VERTEX_SHADER from '../gl/rectangleVertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangleFragment.glsl';
import { rectsToVertices, verticesToVertexData } from '../gl/segmentsToVertices';

import Mark from './mark';


export default class RectMark extends Mark {
    /**
     * @param {import("./viewUnit").UnitContext} unitContext
     */
    constructor(unitContext) {
        super(unitContext)
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
    }

    /**
     * @param {string} sampleId 
     * @param {object} uniforms 
     */
    render(sampleId, uniforms) {
        this.segmentProgram.setUniforms({
            ...uniforms,
            ...fp64.getUniforms()
        });
        this.segmentProgram.draw({
            ...this.vertexDatas.get(sampleId),
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