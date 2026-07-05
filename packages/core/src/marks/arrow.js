import { drawBufferInfo, setBuffersAndAttributes } from "twgl.js";
import VERTEX_SHADER from "./arrow.vertex.glsl";
import FRAGMENT_SHADER from "./arrow.fragment.glsl";
import COMMON_SHADER from "./arrow.common.glsl";
import { RuleVertexBuilder } from "../gl/dataToVertices.js";

import Mark from "./mark.js";
import { fixFill, fixStroke } from "./markUtils.js";
import { isChannelDefWithScale } from "../encoder/encoder.js";
import { fixRuleLikeEncoding } from "./ruleLikeEncoding.js";

const DEGREES_TO_RADIANS = Math.PI / 180;
const MIN_HEAD_SLOPE = 1e-6;
const MIN_HEAD_ANGLE = 1;
const MAX_HEAD_ANGLE = 90;

export const ARROW_UNIFORM_ENUMS = {
    directions: ["forward", "reverse"],
    headShapes: ["triangle", "open"],
    headPlacements: ["inside", "outside"],
};

/**
 * @extends {Mark<import("../spec/mark.js").ArrowProps>}
 */
export default class ArrowMark extends Mark {
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
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "strokeWidth",
            "size",
            "direction",
        ];
    }

    /**
     * @returns {import("../spec/channel.js").Channel[]}
     */
    getSupportedChannels() {
        return [
            ...super.getSupportedChannels(),
            "x2",
            "y2",
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "strokeWidth",
            "size",
            "direction",
        ];
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        fixRuleLikeEncoding(encoding, "arrow");

        if (!encoding.size && isRelativeSize(this.properties.size)) {
            encoding.size = createRelativeSizeDef(
                this.properties.size,
                this.properties.size.channel ?? "auto",
                encoding
            );
        }

        fixStroke(encoding, this.properties.filled);
        fixFill(encoding, this.properties.filled);

        delete encoding.color;
        delete encoding.opacity;

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
            enumIndex(ARROW_UNIFORM_ENUMS.headShapes, value)
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
            (value) => enumIndex(ARROW_UNIFORM_ENUMS.headPlacements, value)
        );
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        if (!collector) {
            console.debug("No collector");
            return;
        }
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
     * @param {import("../types/rendering.js").GlobalRenderingOptions} options
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
     * @param {import("./mark.js").MarkRenderingOptions} options
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

/**
 * @param {unknown} value
 * @returns {value is { band: number, channel?: "x" | "y" | "auto" }}
 */
function isRelativeSize(value) {
    return (
        typeof value == "object" &&
        value !== null &&
        "band" in value &&
        typeof value.band == "number"
    );
}

/**
 * @param {{ band: number, channel?: "x" | "y" | "auto" }} size
 * @param {"x" | "y" | "auto"} referenceChannel
 * @param {import("../spec/channel.js").Encoding} encoding
 */
function createRelativeSizeDef(size, referenceChannel, encoding) {
    const channel = getSizeReferenceChannel(referenceChannel, encoding);
    const dimension = channel == "x" ? "width" : "height";
    const channelDef = encoding[channel];
    const referenceExpr =
        isChannelDefWithScale(channelDef) && channelDef.scale !== null
            ? `bandwidth("${channel}") * ${dimension}`
            : dimension;

    return /** @type {const} */ ({
        value: { expr: `${referenceExpr} * ${size.band}` },
    });
}

/**
 * @param {"x" | "y" | "auto"} channel
 * @param {import("../spec/channel.js").Encoding} encoding
 */
function getSizeReferenceChannel(channel, encoding) {
    if (channel == "auto") {
        return inferPerpendicularChannel(encoding);
    } else if (isDiagonalCapable(encoding)) {
        throw new Error(
            "Band-relative arrow size is not supported for diagonal arrows."
        );
    } else {
        return channel;
    }
}

/**
 * @param {string[]} values
 * @param {string} value
 */
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

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 * @returns {"x" | "y"}
 */
function inferPerpendicularChannel(encoding) {
    if (isDiagonalCapable(encoding)) {
        throw new Error(
            "Band-relative arrow size is not supported for diagonal arrows."
        );
    } else if (isXAligned(encoding)) {
        return "y";
    } else {
        return "x";
    }
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 */
function isDiagonalCapable(encoding) {
    return isXAligned(encoding) && isYAligned(encoding);
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 */
function isXAligned(encoding) {
    return encoding.x2 != null && encoding.x2 !== encoding.x;
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 */
function isYAligned(encoding) {
    return encoding.y2 != null && encoding.y2 !== encoding.y;
}
