import { isString } from "vega-util";
import { format } from "d3-format";
import {
    drawBufferInfo,
    setBlockUniforms,
    setBuffersAndAttributes,
    setUniforms,
} from "twgl.js";
import VERTEX_SHADER from "../gl/text.vertex.glsl";
import FRAGMENT_SHADER from "../gl/text.fragment.glsl";
import COMMON_SHADER from "../gl/text.common.glsl";
import { TextVertexBuilder } from "../gl/dataToVertices.js";

import Mark from "./mark.js";
import { fixPositional } from "./markUtils.js";
import { primaryPositionalChannels } from "../encoder/encoder.js";

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
     * @param {import("../view/unitView.js").default} unitView
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

                viewportEdgeFadeWidthTop: 0,
                viewportEdgeFadeWidthRight: 0,
                viewportEdgeFadeWidthBottom: 0,
                viewportEdgeFadeWidthLeft: 0,

                viewportEdgeFadeDistanceTop: -Infinity,
                viewportEdgeFadeDistanceRight: -Infinity,
                viewportEdgeFadeDistanceBottom: -Infinity,
                viewportEdgeFadeDistanceLeft: -Infinity,
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
     * @returns {import("../spec/channel.js").Channel[]}
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
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
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
        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER, [
            COMMON_SHADER,
        ]);
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();

        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;

        this.registerMarkUniform(
            "uSdfNumerator",
            /** @type {import("../spec/mark.js").ExprRef | number} */
            ({ expr: "devicePixelRatio" }),
            (dpr) => {
                let q = 0.35; // TODO: Ensure that this makes sense. Now chosen by trial & error
                if (this.properties.logoLetters) {
                    // Adjust to make stretched letters a bit less blurry
                    // A proper solution would probably be to compute gradients in the fragment shader
                    // to find a suitable divisor.
                    q /= 2;
                }
                return this.font.metrics.common.base / (dpr / q);
            }
        );

        // TODO: Use uniform block.
        setBlockUniforms(this.markUniformInfo, {
            uPaddingX: props.paddingX,
            uPaddingY: props.paddingY,
            uFlushX: !!props.flushX,
            uFlushY: !!props.flushY,

            uAlign: [alignments[props.align], baselines[props.baseline]],

            uD: [props.dx, -props.dy],

            uLogoLetter: !!props.logoLetters,
            uSqueeze: !!props.squeeze,

            uViewportEdgeFadeWidth: [
                props.viewportEdgeFadeWidthTop,
                props.viewportEdgeFadeWidthRight,
                props.viewportEdgeFadeWidthBottom,
                props.viewportEdgeFadeWidthLeft,
            ],

            uViewportEdgeFadeDistance: [
                props.viewportEdgeFadeDistanceTop,
                props.viewportEdgeFadeDistanceRight,
                props.viewportEdgeFadeDistanceBottom,
                props.viewportEdgeFadeDistanceLeft,
            ],
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
        const numberFormat =
            "format" in encoding.text ? format(encoding.text.format) : (d) => d;
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

        ops.push(() => {
            setUniforms(this.programInfo, {
                uTexture: this.font.texture,
            });
        });

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

        return this.createRenderCallback(
            (offset, count) =>
                drawBufferInfo(
                    gl,
                    this.vertexArrayInfo,
                    gl.TRIANGLES,
                    count,
                    offset
                ),
            options
        );
    }
}
