import { drawBufferInfo, setBuffersAndAttributes } from "twgl.js";
import VERTEX_SHADER from "./arrow.vertex.glsl";
import FRAGMENT_SHADER from "./arrow.fragment.glsl";
import COMMON_SHADER from "./arrow.common.glsl";
import { RuleVertexBuilder } from "../gl/dataToVertices.js";

import WebGLMark from "./webGlMark.js";

const DEGREES_TO_RADIANS = Math.PI / 180;
const MIN_HEAD_SLOPE = 1e-6;
const MIN_HEAD_ANGLE = 1;
const MAX_HEAD_ANGLE = 90;

export const ARROW_HEAD_SHAPES = ["triangle", "open"];
export const ARROW_HEAD_PLACEMENTS = ["inside", "outside"];

/**
 * @extends {WebGLMark}
 */
export default class WebGLArrowMark extends WebGLMark {
    /**
     * @returns {import("../../../spec/channel.js").Channel[]}
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
            /** @type {import("../../../spec/channel.js").Channel} */ (
                "x2Offset"
            ),
            /** @type {import("../../../spec/channel.js").Channel} */ (
                "y2Offset"
            ),
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "strokeWidth",
            "size",
            "direction",
        ];
    }

    initializeGraphics() {
        super.initializeGraphics();

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER, [
            COMMON_SHADER,
        ]);
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();

        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;

        this.registerMarkUniformValue(
            "uHeadSlope",
            props.headAngle,
            headAngleToSlope
        );
        this.registerMarkUniformValue(
            "uHeadNotchSlope",
            props.headNotchAngle,
            headAngleToSlope
        );
        this.registerMarkUniformValue("uHeadShape", props.headShape, (value) =>
            enumIndex(ARROW_HEAD_SHAPES, value)
        );
        this.registerMarkUniformValue("uMinSize", props.minSize);
        this.registerMarkUniformValue("uHeadWidth", props.headWidth);
        this.registerMarkUniformValue("uStartNotch", props.startNotch);
        this.registerMarkUniformValue("uMinStemLength", props.minStemLength);
        this.registerMarkUniformValue(
            "uHeadSpacing",
            props.headSpacing ?? -1,
            nullableSpacingToUniform
        );
        this.registerMarkUniformValue("uStem", props.stem);
        this.registerMarkUniformValue(
            "uHeadPlacement",
            props.headPlacement,
            (value) => enumIndex(ARROW_HEAD_PLACEMENTS, value)
        );
    }

    /** @param {import("../../../data/collector.js").default} collector */
    updateGraphicsData(collector) {
        const numItems = Math.max(
            collector.getItemCount(),
            this.properties.minBufferSize || 0
        );

        const builder = new RuleVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems,
        });

        builder.addBatches(collector.facetBatches);

        const vertexData = builder.toArrays();
        this.rangeMap.migrateEntries(vertexData.rangeMap);
        this.updateBufferInfo(vertexData);
    }

    /**
     * @param {import("../../../types/rendering.js").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        const ops = super.prepareRender(options);

        ops.push(() => this.bindOrSetMarkUniformBlock());

        ops.push(() =>
            setBuffersAndAttributes(
                this.gl,
                this.programInfo,
                this.vertexArrayInfo
            )
        );

        return ops;
    }

    /**
     * @param {import("../types.js").WebGLMarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback((offset, count) => {
            drawBufferInfo(
                gl,
                this.vertexArrayInfo,
                gl.TRIANGLE_STRIP,
                count,
                offset
            );
        }, options);
    }
}

/** @param {string[]} values @param {string} value */
export function enumIndex(values, value) {
    const index = values.indexOf(value);
    if (index < 0) {
        throw new Error(`Unsupported arrow mark value: ${value}`);
    }
    return index;
}

/**
 * @param {number} value
 */
function headAngleToSlope(value) {
    const angle = Math.min(Math.max(value, MIN_HEAD_ANGLE), MAX_HEAD_ANGLE);
    return Math.max(Math.tan(angle * DEGREES_TO_RADIANS), MIN_HEAD_SLOPE);
}

/**
 * @param {number | null} value
 */
function nullableSpacingToUniform(value) {
    return value == null ? -1 : value;
}
