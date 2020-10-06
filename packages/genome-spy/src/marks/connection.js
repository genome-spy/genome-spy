import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/connection.vertex.glsl";
import FRAGMENT_SHADER from "../gl/connection.fragment.glsl";
import { ConnectionVertexBuilder } from "../gl/dataToVertices";

import Mark from "./mark";

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
    }

    getAttributes() {
        return {
            x: { raw: true },
            x2: { raw: true },
            y: { raw: true },
            y2: { raw: true },
            color: {},
            opacity: { raw: true }
        };
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),

            segments: 101 // Performance is affected more by the fill rate, i.e. number of pixels
        };
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

    async initializeGraphics() {
        await super.initializeGraphics();

        this.createShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    updateGraphicsData() {
        this.deleteGraphicsData();

        const vertexCount =
            this.dataBySample.size === 1
                ? [...this.dataBySample.values()][0].length
                : undefined; // TODO: Sum all samples

        const builder = new ConnectionVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            size: vertexCount
        });

        for (const [sample, connections] of this.dataBySample.entries()) {
            builder.addBatch(sample, connections);
        }
        const vertexData = builder.toArrays();

        this._componentNumbers = vertexData.componentNumbers; // TODO: Better place/name/etc

        vertexData.arrays.strip = {
            data: createStrip(this.getProperties().segments),
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
     * @param {import("./mark").SampleToRender[]} samples
     */
    render(samples) {
        super.render(samples);

        const gl = this.gl;
        const props = this.getProperties();

        const getBandwidth = scale =>
            scale && scale.type == "band" ? scale.bandwidth() : 0;

        twgl.setUniforms(this.programInfo, {
            uBandwidth: getBandwidth(this.encoders.y.scale),
            uZoomLevel: this.unitView.getZoomLevel()
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
                    (props.segments + 1) * 2, // number of vertices in a triangle strip
                    0,
                    range.count
                );
            }
        }
    }
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
