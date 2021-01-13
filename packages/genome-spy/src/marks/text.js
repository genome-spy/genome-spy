import { isString } from "vega-util";
import { format } from "d3-format";
import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/text.vertex.glsl";
import FRAGMENT_SHADER from "../gl/text.fragment.glsl";
import { TextVertexBuilder } from "../gl/dataToVertices";
import fontUrl from "../fonts/Lato-Regular.png";
import fontMetadata from "../fonts/Lato-Regular.json";

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
    }

    getAttributes() {
        return ["x", "x2", "y", "y2", "color", "size", "opacity"];
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
     * @param {import("../spec/view").Encoding} encoding
     * @returns {import("../spec/view").Encoding}
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

        const gl = this.gl;

        // TODO: Share the texture with other text mark instances
        const texturePromise = new Promise((resolve, reject) => {
            this.fontTexture = twgl.createTexture(
                gl,
                {
                    src: fontUrl,
                    min: gl.LINEAR
                },
                (err, texture, source) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER);
        return texturePromise;
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();

        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;

        // TODO: Use uniform block.
        twgl.setUniforms(this.programInfo, {
            uSqueeze: props.squeeze ? 1 : 0,
            uPaddingX: props.paddingX,
            uPaddingY: props.paddingY,
            uFlushX: props.flushX ? 1 : 0,
            uFlushY: props.flushY ? 1 : 0,

            uAlignX: alignments[props.align],
            uAlignY: baselines[props.baseline],

            uD: [props.dx, -props.dy],
            uAngle: (-props.angle / 180) * Math.PI,

            uViewportEdgeFadeWidth: props.viewportEdgeFadeWidth,
            uViewportEdgeFadeDistance: props.viewportEdgeFadeDistance.map(d =>
                d === undefined ? -Infinity : d
            )
        });
    }

    updateGraphicsData() {
        const encoding = this.encoding;

        // Count the total number of characters to that we can pre-allocate a typed array
        const accessor = this.encoders.text.accessor || this.encoders.text; // accessor or constant value
        let charCount = 0;
        /** @type {function(any):any} */
        const numberFormat = encoding.text.format
            ? format(encoding.text.format)
            : d => d;
        for (const data of this.dataByFacet.values()) {
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
        }

        const builder = new TextVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            properties: this.properties,
            metadata: fontMetadata,
            numCharacters: Math.max(
                charCount,
                this.properties.minBufferSize || 0
            )
        });

        for (const [sample, texts] of this.dataByFacet.entries()) {
            builder.addBatch(sample, texts);
        }
        const vertexData = builder.toArrays();
        this.rangeMap = vertexData.rangeMap;

        this.updateBufferInfo(vertexData);
    }

    prepareRender() {
        super.prepareRender();

        twgl.setUniforms(this.programInfo, {
            // TODO: Only set texture once it has been loaded
            uTexture: this.fontTexture,
            // TODO: Only update when dpr changes
            uSdfNumerator:
                /** @type {import("../fonts/types").FontMetadata}*/ (fontMetadata)
                    .common.base /
                (this.glHelper.dpr / 0.35) // TODO: Ensure that this makes sense. Now chosen by trial & error
        });

        twgl.setBuffersAndAttributes(
            this.gl,
            this.programInfo,
            this.bufferInfo
        );
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback(
            range =>
                twgl.drawBufferInfo(
                    gl,
                    this.vertexArrayInfo,
                    gl.TRIANGLES,
                    range.count,
                    range.offset
                ),
            options,
            () => this.rangeMap
        );
    }
}
