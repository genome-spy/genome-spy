import { drawBufferInfo, setBuffersAndAttributes } from "twgl.js";
import VERTEX_SHADER from "./arrow.vertex.glsl";
import FRAGMENT_SHADER from "./arrow.fragment.glsl";
import COMMON_SHADER from "./arrow.common.glsl";
import { RectVertexBuilder } from "../gl/dataToVertices.js";

import Mark from "./mark.js";
import { fixFill, fixStroke } from "./markUtils.js";
import { isChannelDefWithScale } from "../encoder/encoder.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";

const DEGREES_TO_RADIANS = Math.PI / 180;
const MIN_HEAD_SLOPE = 1e-6;
const MIN_HEAD_ANGLE = 1;
const MAX_HEAD_ANGLE = 90;

export const ARROW_UNIFORM_ENUMS = {
    orientations: ["horizontal", "vertical"],
    directions: ["forward", "reverse"],
    headShapes: ["triangle", "open"],
    sizeReferenceChannels: ["auto", "x", "y", "view-x", "view-y"],
    headPlacements: ["inside", "outside"],
};

/**
 * @extends {Mark<import("../spec/mark.js").ArrowProps>}
 */
export default class ArrowMark extends Mark {
    /** @type {"horizontal" | "vertical" | import("../spec/parameter.js").ExprRef | undefined} */
    #orient;

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
     * @returns {import("../spec/channel.js").Encoding}
     */
    getDefaultEncoding() {
        const encoding = super.getDefaultEncoding();

        if (!isChannelCompatibleSize(this.properties.size)) {
            encoding.size = { value: 0 };
        }

        return encoding;
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        this.#orient = inferArrowOrient(encoding);

        fixRuleLikeEncoding(encoding);

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

        this.registerMarkUniformValue("uOrient", this.#getOrient(), (value) =>
            enumIndex(ARROW_UNIFORM_ENUMS.orientations, value)
        );
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
        const relativeSize = getRelativeSizeUniformProps(
            props.size,
            this.unitView.getEncoding().size != null,
            this.unitView
        );
        this.registerMarkUniformValue("uSizeBand", relativeSize.band);
        this.registerMarkUniformValue(
            "uSizeReferenceChannel",
            relativeSize.channel,
            (value) =>
                enumIndex(ARROW_UNIFORM_ENUMS.sizeReferenceChannels, value)
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

        const builder = new RectVertexBuilder({
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

    #getOrient() {
        if (!this.#orient) {
            this.#orient = inferArrowOrient(this.encoding);
        }

        return this.#orient;
    }
}

/**
 * @param {unknown} value
 */
function isChannelCompatibleSize(value) {
    return typeof value == "number" || isExprRef(value);
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
 * @param {unknown} size
 * @param {boolean} hasSizeEncoding
 * @param {import("../view/unitView.js").default} unitView
 */
function getRelativeSizeUniformProps(size, hasSizeEncoding, unitView) {
    if (hasSizeEncoding || !isRelativeSize(size)) {
        return { band: -1, channel: "auto" };
    } else {
        return {
            band: size.band,
            channel: getSizeReferenceChannel(size.channel ?? "auto", unitView),
        };
    }
}

/**
 * @param {"x" | "y" | "auto"} channel
 * @param {import("../view/unitView.js").default} unitView
 */
function getSizeReferenceChannel(channel, unitView) {
    if (channel == "auto") {
        return "auto";
    }

    const scale = /** @type {{ bandwidth?: () => number } | undefined} */ (
        unitView.getScaleResolution(channel)?.getScale()
    );
    if (scale && typeof scale.bandwidth == "function") {
        return channel;
    } else {
        return /** @type {"view-x" | "view-y"} */ (`view-${channel}`);
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
 * Completes positional arrow endpoints using the same cases as the rule mark.
 *
 * @param {import("../spec/channel.js").Encoding} encoding
 */
function fixRuleLikeEncoding(encoding) {
    if (encoding.x && encoding.y && encoding.x2 && encoding.y2) {
        // Everything is defined.
    } else if (encoding.x && encoding.x2 && !encoding.y) {
        encoding.y = { value: 0.5 };
        encoding.y2 = encoding.y;
    } else if (encoding.y && encoding.y2 && !encoding.x) {
        encoding.x = { value: 0.5 };
        encoding.x2 = encoding.x;
    } else if (encoding.x && !encoding.y) {
        encoding.y = { value: 0 };
        encoding.y2 = { value: 1 };
        encoding.x2 = encoding.x;
    } else if (encoding.y && !encoding.x) {
        encoding.x = { value: 0 };
        encoding.x2 = { value: 1 };
        encoding.y2 = encoding.y;
    } else if (encoding.x && encoding.y && encoding.y2) {
        encoding.x2 = encoding.x;
    } else if (encoding.y && encoding.x && encoding.x2) {
        encoding.y2 = encoding.y;
    } else if (encoding.y && encoding.x) {
        if (
            !encoding.x2 &&
            isChannelDefWithScale(encoding.y) &&
            encoding.y.type == "quantitative"
        ) {
            encoding.x2 = encoding.x;
            encoding.y2 = { datum: 0 };
        } else if (
            !encoding.y2 &&
            isChannelDefWithScale(encoding.x) &&
            encoding.x.type == "quantitative"
        ) {
            encoding.y2 = encoding.y;
            encoding.x2 = { datum: 0 };
        } else {
            throw new Error("A bug!");
        }
    } else {
        throw new Error(
            "At a minimum, either the x or y channel must be defined in the arrow mark's encoding: " +
                JSON.stringify(encoding)
        );
    }
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 * @returns {"horizontal" | "vertical"}
 */
export function inferArrowOrient(encoding) {
    if (encoding.x2 && !encoding.y2) {
        return "horizontal";
    } else if (encoding.y2 && !encoding.x2) {
        return "vertical";
    }

    const xDirectional = isDirectionalChannel(encoding.x);
    const yDirectional = isDirectionalChannel(encoding.y);

    if (xDirectional && !yDirectional) {
        return "horizontal";
    } else if (yDirectional && !xDirectional) {
        return "vertical";
    } else if (encoding.x && !encoding.y) {
        return "horizontal";
    } else if (encoding.y && !encoding.x) {
        return "vertical";
    } else {
        return "horizontal";
    }
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 */
function isDirectionalChannel(channelDef) {
    return (
        isChannelDefWithScale(channelDef) &&
        ["quantitative", "index", "locus"].includes(channelDef.type)
    );
}
