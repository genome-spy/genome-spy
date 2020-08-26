import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/connection.vertex.glsl";
import FRAGMENT_SHADER from "../gl/connection.fragment.glsl";
import { ConnectionVertexBuilder } from "../gl/dataToVertices";

import Mark from "./mark";

const stripSegments = 151;

const defaultMarkProperties = {};

/** @type {import("../spec/view").EncodingConfigs} */
const defaultEncoding = {
    x: null,
    x2: null,
    y: { value: 0.0 },
    y2: { value: 0.0 },
    height: { value: 1.0 },
    size: { value: 1.0 },
    size2: null,
    color: { value: "black" },
    opacity: { value: 1.0 }
};

export default class ConnectionMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        /** @type {Record<string, any>} */
        this.properties = {
            ...defaultMarkProperties,
            ...this.properties
        };
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    /**
     * @returns {import("../spec/view").EncodingConfigs}
     */
    getEncoding() {
        const encoding = super.getEncoding();

        if (!encoding.size2) {
            encoding.size2 = encoding.size;
        }

        if (!encoding.y2) {
            encoding.y2 = encoding.y;
        }

        if (!encoding.color2) {
            encoding.color2 = encoding.color;
        }

        return encoding;
    }

    initializeEncoders() {
        super.initializeEncoders();
    }

    /**
     *
     * @param {WebGLRenderingContext} gl
     */
    initializeGraphics(gl) {
        super.initializeGraphics(gl);

        this.programInfo = twgl.createProgramInfo(
            gl,
            [VERTEX_SHADER, FRAGMENT_SHADER].map(s => this.processShader(s))
        );

        const vertexCount =
            this.dataBySample.size === 1
                ? [...this.dataBySample.values()][0].length
                : undefined; // TODO: Sum all samples

        const builder = new ConnectionVertexBuilder(this.encoders, vertexCount);

        for (const [sample, connections] of this.dataBySample.entries()) {
            builder.addBatch(sample, connections);
        }
        const vertexData = builder.toArrays();

        function createStrip(/** @type number */ segments) {
            let i = 0;
            const coords = [];

            for (; i <= segments; i++) {
                coords.push(i / segments, 0.5);
                coords.push(i / segments, -0.5);
            }
            return coords;
        }

        vertexData.arrays.strip = {
            data: createStrip(stripSegments),
            numComponents: 2
        };

        this.rangeMap = vertexData.rangeMap;
        this.bufferInfo = twgl.createBufferInfoFromArrays(
            this.gl,
            vertexData.arrays
        );
    }

    /**
     * @param {object[]} samples
     * @param {object} globalUniforms
     */
    render(samples, globalUniforms) {
        const gl = this.gl;
        const dpr = window.devicePixelRatio;

        gl.enable(gl.BLEND);
        gl.useProgram(this.programInfo.program);
        twgl.setUniforms(this.programInfo, {
            ...globalUniforms,
            uYTranslate: 0,
            uYScale: 1,
            uDevicePixelRatio: dpr
        });

        twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);

        for (const sampleData of samples) {
            const range = this.rangeMap.get(sampleData.sampleId);
            if (range) {
                twgl.setUniforms(this.programInfo, sampleData.uniforms);
                twgl.drawBufferInfo(
                    gl,
                    this.bufferInfo,
                    gl.TRIANGLE_STRIP,
                    (stripSegments + 1) * 2, // TODO: Replace magic number (number of vertices)
                    0,
                    range.count
                );
            }
        }
    }

    /**
     * @param {string} sampleId
     * @param {number} x position on the viewport
     * @param {number} y position on the viewport
     * @param {import("../utils/interval").default} yBand the matched band on the band scale
     */
    findDatum(sampleId, x, y, yBand) {}

    /**
     * Finds a datum that overlaps the given value on domain.
     * The result is unspecified if multiple datums are found.
     *
     * TODO: Rename the other findDatum to findSpec
     *
     * @param {string} sampleId
     * @param {number} x position on the x domain
     * @returns {object}
     */
    findDatumAt(sampleId, x) {}

    getRangeAggregates() {}
}
