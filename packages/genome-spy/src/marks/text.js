import { isString } from "vega-util";
import { format } from "d3-format";
import { drawBufferInfo, setBuffersAndAttributes, setUniforms } from "twgl.js";
import VERTEX_SHADER from "../gl/text.vertex.glsl";
import FRAGMENT_SHADER from "../gl/text.fragment.glsl";
import { TextVertexBuilder } from "../gl/dataToVertices";

import Mark from "./mark";
import { fixPositional } from "./markUtils";

/** For GLSL uniforms */
const alignments = {
    left: -1,
    center: 0,
    right: 1
};

/** For GLSL uniforms */
const baselines = {
    top: -1,
    middle: 0,
    bottom: 1,
    alphabetic: 1
};

/**
 * Renders text using SDF fonts
 *
 * Some resources:
 * - Valve's SDF paper: https://doi.org/10.1145/1281500.1281665
 * - Multi-channel SDF fonts: https://github.com/Chlumsky/msdfgen
 * - Google's web fonts as SDFs: https://github.com/etiennepinchon/aframe-fonts
 */
export default class TextMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        this.font = this.properties.font
            ? unitView.context.fontManager.getFont(
                  this.properties.font,
                  this.properties.fontStyle,
                  this.properties.fontWeight
              )
            : unitView.context.fontManager.getDefaultFont();
    }

    getAttributes() {
        return ["facetIndex", "x", "x2", "y", "y2", "color", "size", "opacity"];
    }

    getSupportedChannels() {
        return [...super.getSupportedChannels(), "x2", "y2", "size", "text"];
    }

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),

            x: 0.5,
            y: 0.5,
            x2: undefined,
            y2: undefined,
            text: "",
            size: 11.0,
            color: "black",
            opacity: 1.0,

            // Use the built-in default
            font: undefined,
            fontStyle: undefined,
            fontWeight: undefined,

            align: "center",
            baseline: "middle",
            dx: 0,
            dy: 0,
            angle: 0,

            /** When only primary channel is defined with band/locus scale */
            fitToBand: false,

            squeeze: true,
            paddingX: 0,
            paddingY: 0,
            flushX: true,
            flushY: true,

            logoLetter: false,

            /** @type {number[]} Order: top, right, bottom, left */
            viewportEdgeFadeWidth: [0, 0, 0, 0],

            /** @type {number[]} Order: top, right, bottom, left */
            viewportEdgeFadeDistance: [
                -Infinity,
                -Infinity,
                -Infinity,
                -Infinity
            ]
        };
    }

    /**
     * @param {import("../spec/channel").Encoding} encoding
     * @returns {import("../spec/channel").Encoding}
     */
    fixEncoding(encoding) {
        // TODO: Ensure that both the primary and secondary channel are either variables or constants (values)

        for (const channel of ["x", "y"]) {
            if (this.properties.fitToBand) {
                fixPositional(encoding, channel);
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

        // TODO: Use uniform block.
        setUniforms(this.programInfo, {
            uSqueeze: props.squeeze ? 1 : 0,
            uPaddingX: props.paddingX,
            uPaddingY: props.paddingY,
            uFlushX: props.flushX ? 1 : 0,
            uFlushY: props.flushY ? 1 : 0,

            uAlignX: alignments[props.align],
            uAlignY: baselines[props.baseline],

            uLogoLetter: props.logoLetter ? 1 : 0,

            uD: [props.dx, -props.dy],
            uAngle: (-props.angle / 180) * Math.PI,

            uViewportEdgeFadeWidth: props.viewportEdgeFadeWidth,
            uViewportEdgeFadeDistance: props.viewportEdgeFadeDistance.map(d =>
                d === undefined ? -Infinity : d
            )
        });
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        const data = collector.getData();
        const encoding = this.encoding;

        // Count the total number of characters to that we can pre-allocate a typed array
        const accessor = this.encoders.text.accessor || this.encoders.text; // accessor or constant value
        let charCount = 0;
        /** @type {function(any):any} */
        const numberFormat = encoding.text.format
            ? format(encoding.text.format)
            : d => d;
        for (const d of data) {
            // TODO: Optimization: don't format twice (calculation and actual encoding)
            const value = numberFormat(accessor(d));
            const str = isString(value)
                ? value
                : value === null
                ? ""
                : "" + value;
            charCount += (str && str.length) || 0;
        }

        const builder = new TextVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            properties: this.properties,
            fontMetrics: this.font.metrics,
            numCharacters: Math.max(
                charCount,
                this.properties.minBufferSize || 0
            ),
            buildXIndex: this.properties.buildIndex
        });

        for (const [facetKey, extent] of collector.groupExtentMap) {
            builder.addBatch(facetKey, data, ...extent);
        }

        const vertexData = builder.toArrays();
        this.rangeMap = vertexData.rangeMap;

        this.updateBufferInfo(vertexData);
    }

    prepareRender() {
        super.prepareRender();

        setUniforms(this.programInfo, {
            uTexture: this.font.texture,
            uSdfNumerator:
                this.font.metrics.common.base / (this.glHelper.dpr / 0.35) // TODO: Ensure that this makes sense. Now chosen by trial & error
        });

        setBuffersAndAttributes(
            this.gl,
            this.programInfo,
            this.vertexArrayInfo
        );
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback(
            (offset, count) =>
                drawBufferInfo(
                    gl,
                    this.vertexArrayInfo,
                    gl.TRIANGLES,
                    count,
                    offset
                ),
            options,
            () => this.rangeMap
        );
    }
}
