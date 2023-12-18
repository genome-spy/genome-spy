import {
    bindUniformBlock,
    drawBufferInfo,
    setBlockUniforms,
    setBuffersAndAttributes,
    setUniformBlock,
} from "twgl.js";
import VERTEX_SHADER from "../gl/link.vertex.glsl";
import FRAGMENT_SHADER from "../gl/link.fragment.glsl";
import { LinkVertexBuilder } from "../gl/dataToVertices.js";

import Mark from "./mark.js";
import { isChannelDefWithScale } from "../encoder/encoder.js";

const LINK_SHAPES = ["arc", "dome", "diagonal", "line"];
const ORIENTS = ["vertical", "horizontal"];

export default class LinkMark extends Mark {
    /**
     * @param {import("../view/unitView.js").default} unitView
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
                arcHeightFactor: 1.0,
                minArcHeight: 1.5,
                minPickingSize: 3.0,
                clampApex: false,
                maxChordLength: 50000,
                arcFadingDistance: false,

                linkShape: "arc",
                orient: "vertical",
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

    /** @return {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return [...super.getSupportedChannels(), "x2", "y2", "size"];
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        if (!encoding.x2) {
            if (isChannelDefWithScale(encoding.x)) {
                encoding.x2 = { datum: 0.0 };
            } else {
                encoding.x2 = encoding.x;
            }
        }

        if (!encoding.y2) {
            if (isChannelDefWithScale(encoding.y)) {
                encoding.y2 = { datum: 0.0 };
            } else {
                encoding.y2 = encoding.y;
            }
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

        setBlockUniforms(this.markUniformInfo, {
            uArcHeightFactor: props.arcHeightFactor,
            uMinArcHeight: props.minArcHeight,
            uMinPickingSize: props.minPickingSize,
            uShape: LINK_SHAPES.indexOf(props.linkShape),
            uOrient: ORIENTS.indexOf(props.orient),
            uClampApex: !!props.clampApex,
            uMaxChordLength: props.maxChordLength,
            uArcFadingDistance: props.arcFadingDistance || [0, 0],
        });
        setUniformBlock(this.gl, this.programInfo, this.markUniformInfo);
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        const itemCount = collector.getItemCount();

        const builder = new LinkVertexBuilder({
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

        this.rangeMap.migrateEntries(vertexData.rangeMap);

        this.arrays = Object.fromEntries(
            Object.entries(vertexData.arrays).map(([k, v]) => [
                k,
                { ...v, data: undefined },
            ])
        );

        this.updateBufferInfo(vertexData);
    }

    /**
     * @param {import("../types/rendering.js").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        const ops = super.prepareRender(options);

        ops.push(() => {
            bindUniformBlock(this.gl, this.programInfo, this.markUniformInfo);
        });

        return ops;
    }

    /**
     * @param {import("./mark.js").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback((offset, count) => {
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
                    attribInfo.numComponents &&
                    attribInfo.divisor
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
        }, options);
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
