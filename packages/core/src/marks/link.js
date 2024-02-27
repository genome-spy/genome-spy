import { setBuffersAndAttributes } from "twgl.js";
import VERTEX_SHADER from "./link.vertex.glsl";
import FRAGMENT_SHADER from "./link.fragment.glsl";
import COMMON_SHADER from "./link.common.glsl";
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

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER, [
            COMMON_SHADER,
        ]);
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();
        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;

        this.registerMarkUniformValue(
            "uArcFadingDistance",
            props.arcFadingDistance,
            (x) => x || /** @type {[number, number]} */ ([0, 0])
        );
        this.registerMarkUniformValue(
            "uArcHeightFactor",
            props.arcHeightFactor
        );
        this.registerMarkUniformValue("uMinArcHeight", props.minArcHeight);
        this.registerMarkUniformValue("uMinPickingSize", props.minPickingSize);
        this.registerMarkUniformValue("uShape", props.linkShape, (linkShape) =>
            LINK_SHAPES.indexOf(linkShape)
        );
        this.registerMarkUniformValue("uOrient", props.orient, (orient) =>
            ORIENTS.indexOf(orient)
        );
        this.registerMarkUniformValue(
            "uClampApex",
            props.clampApex,
            (x) => !!x
        );
        this.registerMarkUniformValue("uMaxChordLength", props.maxChordLength);
        this.registerMarkUniformValue(
            "uSegmentBreaks",
            props.segments,
            (x) => x + 1
        );
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        if (!collector) {
            console.debug("No collector");
            return;
        }
        const itemCount = collector.getItemCount();

        const builder = new LinkVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems: itemCount,
        });

        builder.addBatches(collector.facetBatches);

        const vertexData = builder.toArrays();

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

        return this._baseInstanceExt
            ? this.createRenderCallback((offset, count) => {
                  // Using the following extension, which, however, is only a draft and
                  // available if "WebGL Draft Extensions" is enabled in chrome://flags
                  // https://www.khronos.org/registry/webgl/extensions/WEBGL_draw_instanced_base_vertex_base_instance/

                  this._baseInstanceExt.drawArraysInstancedBaseInstanceWEBGL(
                      gl.TRIANGLE_STRIP,
                      0,
                      /** @type {Float32Array} */ (
                          this.markUniformInfo.uniforms.uSegmentBreaks
                      )[0] * 2,
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
                              offset *
                              this.arrays[attribute].numComponents *
                              this.bytesPerElement.get(attribute);
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
                      /** @type {Float32Array} */ (
                          this.markUniformInfo.uniforms.uSegmentBreaks
                      )[0] * 2,
                      count
                  );
              }, options);
    }
}
