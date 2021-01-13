import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/connection.vertex.glsl";
import FRAGMENT_SHADER from "../gl/connection.fragment.glsl";
import { ConnectionVertexBuilder } from "../gl/dataToVertices";

import Mark from "./mark";

export default class ConnectionMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);
    }

    getAttributes() {
        return ["x2", "x2", "y", "y2", "color", "opacity"];
    }

    getSupportedChannels() {
        return [
            ...super.getSupportedChannels(),
            "x2",
            "y2",
            "size",
            "size2",
            "color2"
        ];
    }

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),

            x: undefined,
            x2: undefined,
            y: 0.0,
            y2: 0.0,
            height: 1.0,
            size: 1.0,
            size2: undefined,
            color: "black",
            color2: undefined,
            opacity: 1.0,

            segments: 101 // Performance is affected more by the fill rate, i.e. number of pixels
        };
    }

    /**
     * @param {import("../spec/view").Encoding} encoding
     * @returns {import("../spec/view").Encoding}
     */
    fixEncoding(encoding) {
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

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    updateGraphicsData() {
        const itemCount = [...this.dataByFacet.values()]
            .map(arr => arr.length)
            .reduce((a, c) => a + c, 0);

        const builder = new ConnectionVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems: itemCount
        });

        for (const [sample, connections] of this.dataByFacet.entries()) {
            builder.addBatch(sample, connections);
        }
        const vertexData = builder.toArrays();

        this._componentNumbers = vertexData.componentNumbers; // TODO: Better place/name/etc

        vertexData.arrays.strip = {
            data: createStrip(this.properties.segments),
            numComponents: 2
        };

        this.rangeMap = vertexData.rangeMap;

        this.updateBufferInfo(vertexData);
    }

    prepareRender() {
        this.gl.bindVertexArray(null);

        super.prepareRender();

        const getBandwidth = scale =>
            scale && scale.type == "band" ? scale.bandwidth() : 0;

        twgl.setUniforms(this.programInfo, {
            uBandwidth: getBandwidth(this.encoders.y.scale),
            uZoomLevel: this.unitView.getZoomLevel()
        });
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        // TODO: Vertical clipping in faceted view

        return this.createRenderCallback(
            range => {
                // We are using instanced drawing here.
                // However, WebGL does not provide glDrawElementsInstancedBaseInstance and thus,
                // we have to hack with offsets in vertexAttribPointer
                // TODO: Use VAOs to reduce WebGL calls

                this.gl.bindVertexArray(null);

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

                twgl.drawBufferInfo(
                    gl,
                    this.bufferInfo,
                    gl.TRIANGLE_STRIP,
                    (this.properties.segments + 1) * 2, // number of vertices in a triangle strip
                    0,
                    range.count
                );
            },
            options,
            () => this.rangeMap
        );
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
