
import { Program, assembleShaders } from 'luma.gl';
import VERTEX_SHADER from '../gl/rectangleVertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangleFragment.glsl';
import { rectsToVertices, verticesToVertexData } from '../gl/segmentsToVertices';

import ViewUnit from './viewUnit';


export default class RectMark extends ViewUnit {
    /**
     * @param {import("../tracks/sampleTrack/sampleTrack").default} sampleTrack 
     * @param {Object} layerConfig 
     */
    constructor(sampleTrack, layerConfig) {
        super(sampleTrack, layerConfig);

        // TODO: Make enum, include constraints for ranges, etc, maybe some metadata (description)
        this.visualVariables = {
            x:  { type: "number" },
            x2: { type: "number" },
            y:  { type: "number" },
            y2: { type: "number" },
            color: { type: "color" }
        };
    }

    async initialize() {
        await super.initialize();

        this._initGL();
    }


    _initGL() {
        const gl = this.sampleTrack.gl;

        this.segmentProgram = new Program(gl, assembleShaders(gl, {
            vs: VERTEX_SHADER,
            fs: FRAGMENT_SHADER,
            modules: ['fp64']
        }));

        
        this.vertexDatas = new Map();

        for (let [sample, points] of this.pointsBySample.entries()) {
            points = points.filter(p => p.x2 > p.x);
            if (points.length) {
                this.vertexDatas.set(
                    sample,
                    verticesToVertexData(this.segmentProgram, rectsToVertices(points)));
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
            ONE: 1.0, // WTF: https://github.com/uber/luma.gl/pull/622
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
        const rects = this.pointsBySample.get(sampleId);

        // TODO: BinarySearch
        const rect = rects.find(rect => pos >= rect.x && pos < rect.x2);

        return rect ? rect.rawDatum : null;
    }
}