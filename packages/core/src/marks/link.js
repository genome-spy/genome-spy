import { setBuffersAndAttributes } from "twgl.js";
import VERTEX_SHADER from "./link.vertex.glsl";
import FRAGMENT_SHADER from "./link.fragment.glsl";
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

        /**
         * Only available if "WebGL Draft Extensions" is enabled in chrome://flags
         * But seems to work.
         *
         * @private
         */
        this._baseInstanceExt = this.gl.getExtension(
            "WEBGL_draw_instanced_base_vertex_base_instance"
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

        this.registerMarkUniform(
            "uArcFadingDistance",
            props.arcFadingDistance,
            (x) => x || /** @type {[number, number]} */ ([0, 0])
        );
        this.registerMarkUniform("uArcHeightFactor", props.arcHeightFactor);
        this.registerMarkUniform("uMinArcHeight", props.minArcHeight);
        this.registerMarkUniform("uMinPickingSize", props.minPickingSize);
        this.registerMarkUniform("uShape", props.linkShape, (linkShape) =>
            LINK_SHAPES.indexOf(linkShape)
        );
        this.registerMarkUniform("uOrient", props.orient, (orient) =>
            ORIENTS.indexOf(orient)
        );
        this.registerMarkUniform("uClampApex", props.clampApex, (x) => !!x);
        this.registerMarkUniform("uMaxChordLength", props.maxChordLength);
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

        // TODO: Use gl_VertexID to calculate the strip in the vertex shader
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

        ops.push(() => this.bindOrSetMarkUniformBlock());

        if (this._baseInstanceExt) {
            ops.push(() =>
                setBuffersAndAttributes(
                    this.gl,
                    this.programInfo,
                    this.vertexArrayInfo
                )
            );
        } else {
            ops.push(() => this.gl.bindVertexArray(null));
        }

        return ops;
    }

    /**
     * @param {import("./mark.js").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        const arcVertexCount = (this.properties.segments + 1) * 2;

        return this._baseInstanceExt
            ? this.createRenderCallback((offset, count) => {
                  // Using the following extension, which, however, is only a draft and
                  // available if "WebGL Draft Extensions" is enabled in chrome://flags
                  // https://www.khronos.org/registry/webgl/extensions/WEBGL_draw_instanced_base_vertex_base_instance/

                  this._baseInstanceExt.drawArraysInstancedBaseInstanceWEBGL(
                      gl.TRIANGLE_STRIP,
                      0,
                      arcVertexCount,
                      count,
                      offset
                  );
              }, options)
            : this.createRenderCallback((offset, count) => {
                  // Because vanilla WebGL 2 does not provide glDrawArraysInstancedBaseInstance,
                  // we have to hack with offsets in vertexAttribPointer
                  //
                  // TODO: Use VAOs more intelligently to reduce WebGL calls. In other words,
                  // reserve one VAO for each facet/sample.

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
                  setBuffersAndAttributes(
                      gl,
                      this.programInfo,
                      this.bufferInfo
                  );

                  gl.drawArraysInstanced(
                      gl.TRIANGLE_STRIP,
                      0,
                      arcVertexCount,
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
    return new Float32Array(coords);
}
