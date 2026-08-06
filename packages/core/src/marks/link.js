import { setBuffersAndAttributes } from "twgl.js";
import VERTEX_SHADER from "./link.vertex.glsl";
import FRAGMENT_SHADER from "./link.fragment.glsl";
import COMMON_SHADER from "./link.common.glsl";
import { LinkVertexBuilder } from "../gl/dataToVertices.js";

import Mark from "./mark.js";
import { isChannelDefWithScale } from "../encoder/encoder.js";
import { createSvgElement } from "../view/renderingContext/svgViewRenderingContext.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    encodePosition,
    toSvgString,
} from "./svgMarkUtils.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";

const LINK_SHAPES = ["arc", "dome", "diagonal", "line"];
const ORIENTS = ["vertical", "horizontal"];

/**
 * @extends {Mark<import("../spec/mark.js").LinkProps>}
 */
export default class LinkMark extends Mark {
    /**
     * @param {import("../view/unitView.js").default} unitView
     */
    constructor(unitView) {
        super(unitView);
        /**
         * Only available if "WebGL Draft Extensions" is enabled in chrome://flags
         * But seems to work.
         *
         * @private
         */
        this._baseInstanceExt = undefined;
    }

    /**
     * Returns the default hit test mode for this mark.
     * @returns {import("./mark.js").HitTestMode}
     */
    get defaultHitTestMode() {
        return "endpoints";
    }

    /**
     * @returns {import("../spec/channel.js").Channel[]}
     */
    getAttributes() {
        return [
            "uniqueId",
            "facetIndex",
            "x",
            "x2",
            "y",
            "y2",
            "xOffset",
            "yOffset",
            /** @type {import("../spec/channel.js").Channel} */ ("x2Offset"),
            /** @type {import("../spec/channel.js").Channel} */ ("y2Offset"),
            "size",
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

        this._baseInstanceExt = this.gl.getExtension(
            "WEBGL_draw_instanced_base_vertex_base_instance"
        );

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
            (x) => x
        );
        this.registerMarkUniformValue(
            "uNoFadingOnPointSelection",
            props.noFadingOnPointSelection,
            (x) => !!x
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
                { ...v, data: /** @type {any} */ (undefined) },
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

        const getInstanceVertexCount = () => {
            const breaks = /** @type {Float32Array} */ (
                this.markUniformInfo.uniforms.uSegmentBreaks
            )[0];

            return (breaks + 1) * 2;
        };

        return this._baseInstanceExt
            ? this.createRenderCallback((offset, count) => {
                  // Using the following extension, which, however, is only a draft and
                  // available if "WebGL Draft Extensions" is enabled in chrome://flags
                  // https://www.khronos.org/registry/webgl/extensions/WEBGL_draw_instanced_base_vertex_base_instance/

                  this._baseInstanceExt.drawArraysInstancedBaseInstanceWEBGL(
                      gl.TRIANGLE_STRIP,
                      0,
                      getInstanceVertexCount(),
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
                      getInstanceVertexCount(),
                      count
                  );
              }, options);
    }

    /**
     * @param {import("../view/renderingContext/svgViewRenderingContext.js").default} context
     * @param {import("../view/renderingContext/svgViewRenderingContext.js").SvgMarkRenderingOptions} options
     */
    renderSvg(context, options) {
        const props = this.properties;
        const arcFadingDistance = requireConstantProperty(
            props.arcFadingDistance,
            "arcFadingDistance"
        );
        if (
            arcFadingDistance !== false &&
            arcFadingDistance[0] > 0 &&
            arcFadingDistance[1] > 0
        ) {
            throw new Error("SVG export does not support link arc fading yet.");
        }

        const shape = requireConstantProperty(props.linkShape, "linkShape");
        const orient = requireConstantProperty(props.orient, "orient");
        const geometryOptions = {
            shape,
            orient,
            arcHeightFactor: requireConstantProperty(
                props.arcHeightFactor,
                "arcHeightFactor"
            ),
            minArcHeight: requireConstantProperty(
                props.minArcHeight,
                "minArcHeight"
            ),
            maxChordLength: requireConstantProperty(
                props.maxChordLength,
                "maxChordLength"
            ),
            clampApex: requireConstantProperty(props.clampApex, "clampApex"),
        };
        const { coords, data, group, viewOpacity } = options;
        const encoders =
            /** @type {Record<string, import("../types/encoder.js").Encoder>} */ (
                this.encoders
            );
        const encodeStyles = createSvgAttributeEncoder(group, {
            stroke: { encoder: encoders.color, transform: toSvgString },
            "stroke-opacity": {
                encoder: encoders.opacity,
                transform: (value) => +value * viewOpacity,
            },
            "stroke-width": { encoder: encoders.size },
        });
        group.setAttribute("fill", "none");
        group.setAttribute("stroke-linecap", "butt");

        for (const datum of data) {
            const xOffset = encodeNumber(encoders.xOffset, datum);
            const yOffset = encodeNumber(encoders.yOffset, datum);
            const a = [
                encodePosition(encoders.x, datum) * coords.width + xOffset,
                encodePosition(encoders.y, datum) * coords.height - yOffset,
            ];
            const b = [
                encodePosition(encoders.x2, datum) * coords.width +
                    (encoders.x2Offset
                        ? encodeNumber(encoders.x2Offset, datum)
                        : xOffset),
                encodePosition(encoders.y2, datum) * coords.height -
                    (encoders.y2Offset
                        ? encodeNumber(encoders.y2Offset, datum)
                        : yOffset),
            ];
            const points = getBezierPoints(
                /** @type {[number, number]} */ (a),
                /** @type {[number, number]} */ (b),
                { width: coords.width, height: coords.height },
                geometryOptions
            ).map(([x, y]) => [coords.x + x, coords.y + coords.height - y]);
            const [p1, p2, p3, p4] = points;
            const path = createSvgElement("path", {
                d: `M ${p1.join(" ")} C ${p2.join(" ")} ${p3.join(" ")} ${p4.join(" ")}`,
                ...encodeStyles(datum),
            });
            group.appendChild(path);
        }
    }
}

/**
 * @typedef {object} LinkGeometryOptions
 * @prop {"arc" | "dome" | "diagonal" | "line"} shape
 * @prop {"vertical" | "horizontal"} orient
 * @prop {number} arcHeightFactor
 * @prop {number} minArcHeight
 * @prop {number} maxChordLength
 * @prop {boolean} clampApex
 */

/**
 * Computes the same cubic Bézier control points as the link vertex shader.
 * Coordinates use a bottom-left origin and logical pixels.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {{width: number, height: number}} viewport
 * @param {LinkGeometryOptions} options
 * @returns {[[number, number], [number, number], [number, number], [number, number]]}
 */
export function getBezierPoints(a, b, viewport, options) {
    if (options.shape == "arc") {
        const p1 = /** @type {[number, number]} */ ([...a]);
        const p4 = /** @type {[number, number]} */ ([...b]);
        const chord = subtract(p4, p1);
        let chordLength = length(chord);
        if (chordLength == 0) {
            return [p1, p1, p4, p4];
        }
        const unitChord = scale(chord, 1 / chordLength);
        const normal = /** @type {[number, number]} */ ([
            -unitChord[1],
            unitChord[0],
        ]);
        chordLength = clampChordToViewport(
            p1,
            p4,
            chordLength,
            options.maxChordLength,
            viewport
        );
        const height = Math.max(
            (chordLength / 2) * options.arcHeightFactor,
            options.minArcHeight
        );
        const controlOffset = scale(normal, height / 0.75);
        return [p1, add(p1, controlOffset), add(p4, controlOffset), p4];
    } else if (options.shape == "dome") {
        /** @type {[number, number]} */
        let p1;
        /** @type {[number, number]} */
        let p4;
        /** @type {[number, number]} */
        let height;

        if (options.orient == "vertical") {
            p1 = [Math.min(a[0], b[0]), b[1]];
            p4 = [Math.max(a[0], b[0]), b[1]];
            height = [0, a[1] - b[1]];
        } else {
            p1 = [b[0], Math.min(a[1], b[1])];
            p4 = [b[0], Math.max(a[1], b[1])];
            height = [a[0] - b[0], 0];
        }

        const chordLength = length(subtract(p4, p1));
        clampChordToViewport(
            p1,
            p4,
            chordLength,
            options.maxChordLength,
            viewport
        );
        if (options.clampApex) {
            clampDomeApex(p1, p4, options.orient, viewport);
        }
        const controlOffset = scale(height, 1 / 0.75);
        return [p1, add(p1, controlOffset), add(p4, controlOffset), p4];
    } else if (options.shape == "diagonal") {
        if (options.orient == "vertical") {
            const middle = (a[1] + b[1]) / 2;
            return [a, [a[0], middle], [b[0], middle], b];
        } else {
            const middle = (a[0] + b[0]) / 2;
            return [a, [middle, a[1]], [middle, b[1]], b];
        }
    } else if (options.shape == "line") {
        const middle = scale(add(a, b), 0.5);
        return [a, middle, middle, b];
    } else {
        throw new Error(`Unsupported link shape: ${options.shape}`);
    }
}

/**
 * @template T
 * @param {T | import("../spec/parameter.js").ExprRef} value
 * @param {string} name
 * @returns {T}
 */
function requireConstantProperty(value, name) {
    if (isExprRef(value)) {
        throw new Error(
            `SVG export does not support expression-valued link property "${name}" yet.`
        );
    }
    return value;
}

/**
 * @param {[number, number]} p1
 * @param {[number, number]} p4
 * @param {number} chordLength
 * @param {number} maxChordLength
 * @param {{width: number, height: number}} viewport
 * @returns {number}
 */
function clampChordToViewport(p1, p4, chordLength, maxChordLength, viewport) {
    if (chordLength <= maxChordLength) {
        return chordLength;
    }

    const unitChord = scale(subtract(p4, p1), 1 / chordLength);
    if (isInsideViewport(p1, viewport, 2)) {
        copyPoint(p4, add(p1, scale(unitChord, maxChordLength)));
        return maxChordLength;
    } else if (isInsideViewport(p4, viewport, 2)) {
        copyPoint(p1, subtract(p4, scale(unitChord, maxChordLength)));
        return maxChordLength;
    } else {
        return chordLength;
    }
}

/**
 * @param {[number, number]} p1
 * @param {[number, number]} p4
 * @param {"vertical" | "horizontal"} orient
 * @param {{width: number, height: number}} viewport
 */
function clampDomeApex(p1, p4, orient, viewport) {
    if (orient == "vertical") {
        if (p4[0] > 0) {
            p1[0] = Math.max(p1[0], -p4[0]);
        }
        if (p1[0] < viewport.width) {
            p4[0] = Math.min(p4[0], 2 * viewport.width - p1[0]);
        }
    } else {
        if (p4[1] > 0) {
            p1[1] = Math.max(p1[1], -p4[1]);
        }
        if (p1[1] < viewport.height) {
            p4[1] = Math.min(p4[1], 2 * viewport.height - p1[1]);
        }
    }
}

/**
 * @param {[number, number]} point
 * @param {{width: number, height: number}} viewport
 * @param {number} marginFactor
 */
function isInsideViewport(point, viewport, marginFactor) {
    return (
        point[0] >= -viewport.width * marginFactor &&
        point[0] <= viewport.width * (1 + marginFactor) &&
        point[1] >= -viewport.height * marginFactor &&
        point[1] <= viewport.height * (1 + marginFactor)
    );
}

/** @param {[number, number]} a @param {[number, number]} b */
function add(a, b) {
    return /** @type {[number, number]} */ ([a[0] + b[0], a[1] + b[1]]);
}

/** @param {[number, number]} a @param {[number, number]} b */
function subtract(a, b) {
    return /** @type {[number, number]} */ ([a[0] - b[0], a[1] - b[1]]);
}

/** @param {[number, number]} a @param {number} scalar */
function scale(a, scalar) {
    return /** @type {[number, number]} */ ([a[0] * scalar, a[1] * scalar]);
}

/** @param {[number, number]} a */
function length(a) {
    return Math.hypot(a[0], a[1]);
}

/** @param {[number, number]} target @param {[number, number]} source */
function copyPoint(target, source) {
    target[0] = source[0];
    target[1] = source[1];
}
