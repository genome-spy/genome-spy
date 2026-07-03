import { drawBufferInfo, setBuffersAndAttributes } from "twgl.js";
import VERTEX_SHADER from "./arrow.vertex.glsl";
import FRAGMENT_SHADER from "./arrow.fragment.glsl";
import COMMON_SHADER from "./arrow.common.glsl";
import { RectVertexBuilder } from "../gl/dataToVertices.js";

import Mark from "./mark.js";
import { fixCoveragePositional, fixFill, fixStroke } from "./markUtils.js";
import { isChannelDefWithScale } from "../encoder/encoder.js";

const DEGREES_TO_RADIANS = Math.PI / 180;
const MIN_HEAD_SLOPE = 1e-6;
const MIN_HEAD_ANGLE = 5;
const MAX_HEAD_ANGLE = 90;

export const ARROW_UNIFORM_ENUMS = {
    orientations: ["horizontal", "vertical"],
    directions: ["forward", "reverse"],
    headShapes: ["triangle", "open"],
    units: ["px", "proportion"],
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
        ];
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        this.#orient = this.properties.orient ?? inferArrowOrient(encoding);

        fixCoveragePositional(encoding, "x");
        fixCoveragePositional(encoding, "y");

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
        this.registerMarkUniformValue("uDirection", props.direction, (value) =>
            enumIndex(ARROW_UNIFORM_ENUMS.directions, value)
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
        this.registerMarkUniformValue("uHeadWidth", props.headWidth);
        this.registerMarkUniformValue(
            "uHeadWidthUnit",
            props.headWidthUnit,
            (value) => enumIndex(ARROW_UNIFORM_ENUMS.units, value)
        );
        this.registerMarkUniformValue("uStartNotch", props.startNotch);
        this.registerMarkUniformValue("uMinStemLength", props.minStemLength);
        this.registerMarkUniformValue("uHeadRepeat", props.headRepeat);
        this.registerMarkUniformValue("uHeadSpacing", props.headSpacing);
        this.registerMarkUniformValue("uStemWidth", props.stemWidth);
        this.registerMarkUniformValue(
            "uStemWidthUnit",
            props.stemWidthUnit,
            (value) => enumIndex(ARROW_UNIFORM_ENUMS.units, value)
        );
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
            this.#orient =
                this.properties.orient ?? inferArrowOrient(this.encoding);
        }

        return this.#orient;
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
 * @param {import("../spec/channel.js").Encoding} encoding
 * @returns {"horizontal" | "vertical"}
 */
function inferArrowOrient(encoding) {
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
