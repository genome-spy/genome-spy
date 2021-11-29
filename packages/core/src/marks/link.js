import { drawBufferInfo, setBuffersAndAttributes, setUniforms } from "twgl.js";
import VERTEX_SHADER from "../gl/link.vertex.glsl";
import FRAGMENT_SHADER from "../gl/link.fragment.glsl";
import { ConnectionVertexBuilder } from "../gl/dataToVertices";

import Mark from "./mark";

export default class LinkMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        Object.defineProperties(
            this.defaultProperties,
            Object.getOwnPropertyDescriptors({
                x: 0.0,
                x2: undefined,
                y: 0.0,
                y2: undefined,
                size: 1.0,
                color: "black",
                opacity: 1.0,

                segments: 101, // Performance is affected more by the fill rate, i.e. number of pixels
                sagittaScaleFactor: 1.0,
                minSagittaLength: 1.5,
            })
        );
    }

    getAttributes() {
        return [
            "uniqueId",
            "facetIndex",
            "x",
            "x2",
            "y",
            "y2",
            "size",
            "height",
            "color",
            "opacity",
        ];
    }

    /** @return {import("../spec/channel").Channel[]} */
    getSupportedChannels() {
        return [...super.getSupportedChannels(), "x2", "y2", "size"];
    }

    /**
     * @param {import("../spec/channel").Encoding} encoding
     * @returns {import("../spec/channel").Encoding}
     */
    fixEncoding(encoding) {
        if (!encoding.x) {
            encoding.x2 = encoding.x;
        }

        if (!encoding.y2) {
            encoding.y2 = encoding.y;
        }

        return encoding;
    }

    async initializeGraphics() {
        await super.initializeGraphics();

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();
        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;

        // TODO: Use uniform block.
        setUniforms(this.programInfo, {
            uSagittaScaleFactor: props.sagittaScaleFactor,
            uMinSagittaLength: props.minSagittaLength,
        });
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        const itemCount = collector.getItemCount();

        const builder = new ConnectionVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems: itemCount,
        });

        builder.addBatches(collector.facetBatches);

        const vertexData = builder.toArrays();

        vertexData.arrays.strip = {
            data: createStrip(this.properties.segments),
            numComponents: 2,
        };

        this.rangeMap = vertexData.rangeMap;

        this.arrays = Object.fromEntries(
            Object.entries(vertexData.arrays).map(([k, v]) => [
                k,
                { ...v, data: undefined },
            ])
        );

        this.updateBufferInfo(vertexData);
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        // TODO: Vertical clipping in faceted view

        return this.createRenderCallback(
            (offset, count) => {
                // We are using instanced drawing here.
                // However, WebGL does not provide glDrawArraysInstancedBaseInstance and thus,
                // we have to hack with offsets in vertexAttribPointer
                // TODO: Use VAOs more intelligently to reduce WebGL calls
                // TODO: Explore multiDrawArraysInstancedWEBGL
                // There's also a promising extension draft:
                // https://www.khronos.org/registry/webgl/extensions/WEBGL_draw_instanced_base_vertex_base_instance/
                // (and https://www.khronos.org/registry/webgl/extensions/WEBGL_multi_draw_instanced_base_vertex_base_instance/)

                this.gl.bindVertexArray(this.vertexArrayInfo.vertexArrayObject);

                for (const attribInfoObject of Object.entries(
                    this.bufferInfo.attribs
                )) {
                    const [attribute, attribInfo] = attribInfoObject;
                    if (
                        attribInfo.buffer &&
                        this.arrays[attribute].numComponents
                    ) {
                        attribInfo.offset =
                            offset * this.arrays[attribute].numComponents * 4; // gl.FLOAT in bytes
                    }
                }
                setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);

                drawBufferInfo(
                    gl,
                    this.bufferInfo,
                    gl.TRIANGLE_STRIP,
                    (this.properties.segments + 1) * 2, // number of vertices in a triangle strip
                    0,
                    count
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
