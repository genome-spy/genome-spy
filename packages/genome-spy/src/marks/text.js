import { isString } from "vega-util";
import { format } from "d3-format";
import { drawBufferInfo, setBuffersAndAttributes, setUniforms } from "twgl.js";
import VERTEX_SHADER from "../gl/text.vertex.glsl";
import FRAGMENT_SHADER from "../gl/text.fragment.glsl";
import { TextVertexBuilder } from "../gl/dataToVertices";

import Mark from "./mark";
import { fixPositional } from "./markUtils";
import { primaryPositionalChannels } from "../encoder/encoder";

/** For GLSL uniforms */
const alignments = {
    left: -1,
    center: 0,
    right: 1,
};

/** For GLSL uniforms */
const baselines = {
    top: -1,
    middle: 0,
    bottom: 1,
    alphabetic: 1,
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

        Object.defineProperties(
            this.defaultProperties,
            Object.getOwnPropertyDescriptors({
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

                /** Stretch letters so that they can be used with sequence logos etc... */
                logoLetters: false,

                /** @type {number[]} Order: top, right, bottom, left */
                viewportEdgeFadeWidth: [0, 0, 0, 0],

                /** @type {number[]} Order: top, right, bottom, left */
                viewportEdgeFadeDistance: [
                    -Infinity,
                    -Infinity,
                    -Infinity,
                    -Infinity,
                ],
            })
        );

        this.font = this.properties.font
            ? unitView.context.fontManager.getFont(
                  this.properties.font,
                  this.properties.fontStyle,
                  this.properties.fontWeight
              )
            : unitView.context.fontManager.getDefaultFont();
    }

    getAttributes() {
        return [
            "uniqueId",
            "facetIndex",
            "x",
            "x2",
            "y",
            "y2",
            "color",
            "size",
            "opacity",
            "angle",
        ];
    }

    /**
     * @returns {import("../spec/channel").Channel[]}
     */
    getSupportedChannels() {
        return [
            ...super.getSupportedChannels(),
            "x2",
            "y2",
            "size",
            "text",
            "angle",
        ];
    }

    /**
     * @param {import("../spec/channel").Encoding} encoding
     * @returns {import("../spec/channel").Encoding}
     */
    fixEncoding(encoding) {
        // TODO: Ensure that both the primary and secondary channel are either variables or constants (values)

        for (const channel of primaryPositionalChannels) {
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
            uPaddingX: props.paddingX,
            uPaddingY: props.paddingY,
            uFlushX: !!props.flushX,
            uFlushY: !!props.flushY,

            uAlignX: alignments[props.align],
            uAlignY: baselines[props.baseline],

            uD: [props.dx, -props.dy],

            uLogoLetter: !!props.logoLetters,
            uSqueeze: !!props.squeeze,

            uViewportEdgeFadeWidth: props.viewportEdgeFadeWidth,
            uViewportEdgeFadeDistance: props.viewportEdgeFadeDistance.map((d) =>
                d === undefined ? -Infinity : d
            ),
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
            : (d) => d;
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
            buildXIndex: this.properties.buildIndex,
        });

        builder.addBatches(collector.facetBatches);

        const vertexData = builder.toArrays();
        this.rangeMap = vertexData.rangeMap;

        this.updateBufferInfo(vertexData);
    }

    /**
     * @param {import("../view/rendering").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        super.prepareRender(options);

        let q = 0.35; // TODO: Ensure that this makes sense. Now chosen by trial & error
        if (this.properties.logoLetters) {
            // Adjust to make stretched letters a bit less blurry
            // A proper solution would probably be to compute gradients in the fragment shader
            // to find a suitable divisor.
            q /= 2;
        }

        setUniforms(this.programInfo, {
            uTexture: this.font.texture,
            uSdfNumerator:
                this.font.metrics.common.base / (this.glHelper.dpr / q),
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
