import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/connection.vertex.glsl";
import FRAGMENT_SHADER from "../gl/connection.fragment.glsl";
import { ConnectionVertexBuilder } from "../gl/dataToVertices";

import Mark from "./mark";

const defaultMarkProperties = {
    segments: 101 // Performance is affected more by the fill rate, i.e. number of pixels
};

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
    color2: null,
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

        this.opaque = this.getEncoding().opacity.value >= 1.0;
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    /**
     * @returns {import("../spec/view").EncodingConfigs}
     */
    getEncoding() {
        const encoding = super.getEncoding();

        if (!encoding.x) {
            throw new Error(
                "The x channel has not been defined: " +
                    JSON.stringify(encoding)
            );
        }

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

    async initializeGraphics() {
        await super.initializeGraphics();

        this.programInfo = twgl.createProgramInfo(
            this.gl,
            [VERTEX_SHADER, FRAGMENT_SHADER].map(s =>
                this.glHelper.processShader(s)
            )
        );
    }

    async updateGraphicsData() {
        this.deleteGraphicsData();

        const vertexCount =
            this.dataBySample.size === 1
                ? [...this.dataBySample.values()][0].length
                : undefined; // TODO: Sum all samples

        const builder = new ConnectionVertexBuilder(this.encoders, vertexCount);

        for (const [sample, connections] of this.dataBySample.entries()) {
            builder.addBatch(sample, connections);
        }
        const vertexData = builder.toArrays();

        this._componentNumbers = vertexData.componentNumbers; // TODO: Better place/name/etc

        vertexData.arrays.strip = {
            data: createStrip(this.properties.segments),
            numComponents: 2
        };

        this.rangeMap = vertexData.rangeMap;
        this.bufferInfo = twgl.createBufferInfoFromArrays(
            this.gl,
            vertexData.arrays,
            { numElements: vertexData.vertexCount }
        );
    }

    /**
     * @param {object[]} samples
     */
    render(samples) {
        super.render(samples);

        const gl = this.gl;

        if (this.opaque) {
            gl.disable(gl.BLEND);
        } else {
            gl.enable(gl.BLEND);
        }

        const getBandwidth = scale =>
            scale && scale.type == "band" ? scale.bandwidth() : 0;

        gl.useProgram(this.programInfo.program);
        this.setViewport(this.programInfo);
        twgl.setUniforms(this.programInfo, {
            ...this.getGlobalUniforms(),
            uBandwidth: getBandwidth(this.encoders.y.scale)
        });

        // TODO: Vertical clipping in faceted view

        for (const sampleData of samples) {
            const range = this.rangeMap.get(sampleData.sampleId);
            if (range) {
                // We are using instanced drawing here.
                // However, WebGL does not provide glDrawElementsInstancedBaseInstance and thus,
                // we have to hack with offsets in vertexAttribPointer
                // TODO: Use VAOs to reduce WebGL calls
                for (const attribInfoObject of Object.entries(
                    this.bufferInfo.attribs
                )) {
                    const [attribute, attribInfo] = attribInfoObject;
                    if (
                        attribInfo.buffer &&
                        this._componentNumbers[attribute]
                    ) {
                        attribInfo.offset =
                            range.offset *
                            this._componentNumbers[attribute] *
                            4; // gl.FLOAT in bytes
                    }
                }
                twgl.setBuffersAndAttributes(
                    gl,
                    this.programInfo,
                    this.bufferInfo
                );

                twgl.setUniforms(this.programInfo, sampleData.uniforms);

                twgl.drawBufferInfo(
                    gl,
                    this.bufferInfo,
                    gl.TRIANGLE_STRIP,
                    (this.properties.segments + 1) * 2, // number of vertices in a triangle strip
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

function createStrip(/** @type number */ segments) {
    let i = 0;
    const coords = [];

    for (; i <= segments; i++) {
        coords.push(i / segments, 0.5);
        coords.push(i / segments, -0.5);
    }
    return coords;
}
