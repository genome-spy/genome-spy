import * as twgl from 'twgl-base.js';
import { pointsToVertices, verticesToVertexData } from '../gl/segmentsToVertices';
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

        this.programInfo = twgl.createProgramInfo(gl, [
            VERTEX_SHADER,
            FRAGMENT_SHADER
        ]);


        this.bufferInfos = new Map();

        for (let [sample, points] of this.specsBySample.entries()) {
            points = points.filter(p => p.size !== 0.0);
            if (points.length) {
                const vertexData = pointsToVertices(points);
                this.bufferInfos.set(sample, twgl.createBufferInfoFromArrays(this.gl, vertexData.arrays));
            }
        }
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

            twgl.drawBufferInfo(gl, bufferInfo, gl.POINTS);
        }
    }

    /**
     * @param {string} sampleId 
     * @param {number} domainPos position on the domain
     * @param {number} y position inside the viewport in pixels
     */
    findDatum(sampleId, domainPos, y) {
        return;
        // TODO: Fisheye may need some adjustments

        const points = this.pointsBySample.get(sampleId);
        if (!points) {
            return null;
        }

        const bandInterval = this.sampleTrack.sampleScale.scale(sampleId);
        const pointY = bandInterval.centre();

        const maxPointSize = Math.min(maxPointSizeAbsolute, maxPointSizeRelative * bandInterval.width());

        const distance = (x1, x2, y1, y2) => Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        const scale = this.genomeSpy.rescaledX;

        const x = scale(domainPos);

        // TODO: BinarySearch! First compute the possible range based on the maximum point size...
        // ... and then perform a linear search through it
        let lastMatch = null;
        for (const point of points) {
            const dist = distance(x, scale(point.pos), y, pointY);
            if (dist < maxPointSize * point.size) {
                lastMatch = point;
            }
        }

        return lastMatch ? lastMatch.rawDatum : null;
    }
}
