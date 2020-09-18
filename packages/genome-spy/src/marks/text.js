import { isString } from "vega-util";
import { format } from "d3-format";
import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/text.vertex.glsl";
import FRAGMENT_SHADER from "../gl/text.fragment.glsl";
import { TextVertexBuilder } from "../gl/dataToVertices";
import fontUrl from "../fonts/Lato-Regular.png";
import fontMetadata from "../fonts/Lato-Regular.json";

import Mark from "./mark";

const defaultMarkProperties = {
    align: "left",
    baseline: "alphabetic",
    dx: 0,
    dy: 0
};

/** @type {import("../spec/view").EncodingConfigs} */
const defaultEncoding = {
    x: null,
    y: { value: 0.5 },
    text: { value: "" },
    size: { value: 11.0 },
    color: { value: "black" },
    opacity: { value: 1.0 }
};

/** For GLSL uniforms */
const alignments = {
    left: -1,
    center: 0,
    right: 1
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

        /** @type {Record<string, any>} */
        this.properties = {
            ...defaultMarkProperties,
            ...this.properties
        };
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    /**
     * @returns {import("../spec/view").EncodingConfigs}
     */
    getEncoding() {
        const encoding = super.getEncoding();

        if (!encoding.x) {
            throw new Error(
                "The x channel has not been defined: " +
                    JSON.stringify(encoding)
            );
        }

        return encoding;
    }

    initializeEncoders() {
        // TODO: Move this hack elsewhere. This is now copypaste from pointmark.
        super.initializeEncoders();
        const yScale = this.getScale("y", true);
        if (yScale && yScale.bandwidth) {
            const offset = yScale.bandwidth() / 2;
            const ye = this.encoders.y;
            this.encoders.y = d => ye(d) + offset;
            // TODO: Set default baseline
        }
    }

    /**
     *
     * @param {WebGLRenderingContext} gl
     */
    async initializeGraphics() {
        await super.initializeGraphics();

        const glHelper = this.getContext().glHelper;
        const gl = glHelper.gl;

        const encoding = this.getEncoding();

        const defines = encoding.x2 ? ["#define X2_ENABLED"] : [];

        this.programInfo = twgl.createProgramInfo(
            gl,
            [VERTEX_SHADER, FRAGMENT_SHADER].map(s =>
                glHelper.processShader(s, defines)
            )
        );

        const textureReadyPromise = new Promise((resolve, reject) => {
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

        // Count the total number of characters to that we can pre-allocate a typed array
        const accessor = this.encoders.text.accessor || this.encoders.text; // accessor or constant value
        let charCount = 0;
        /** @type {function(any):any} */
        const numberFormat = encoding.text.format
            ? format(encoding.text.format)
            : d => d;
        for (const data of this.dataBySample.values()) {
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

        const builder = new TextVertexBuilder(
            this.encoders,
            fontMetadata,
            this.properties,
            charCount
        );

        for (const [sample, texts] of this.dataBySample.entries()) {
            builder.addBatch(sample, texts);
        }
        const vertexData = builder.toArrays();

        this.rangeMap = vertexData.rangeMap;
        this.bufferInfo = twgl.createBufferInfoFromArrays(
            gl,
            vertexData.arrays
        );

        await textureReadyPromise;
    }

    /**
     * @param {object[]} samples
     * @param {object} globalUniforms
     */
    render(samples, globalUniforms) {
        const dpr = window.devicePixelRatio;
        const glHelper = this.getContext().glHelper;
        const gl = glHelper.gl;

        gl.enable(gl.BLEND);

        gl.useProgram(this.programInfo.program);
        this.setViewport(this.programInfo);

        twgl.setUniforms(this.programInfo, {
            ...this.getGlobalUniforms(),
            uTexture: this.fontTexture,
            uD: [this.properties.dx, -this.properties.dy],
            uPaddingX: 4.0, // TODO: Configurable
            uAlign: alignments[this.properties.align],
            uSdfNumerator:
                /** @type {import("../fonts/types").FontMetadata}*/ (fontMetadata)
                    .common.base /
                (dpr / 0.35) // TODO: Ensure that this makes sense. Now chosen by trial & error
        });

        twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);

        for (const sampleData of samples) {
            const range = this.rangeMap.get(sampleData.sampleId);
            if (range) {
                twgl.setUniforms(this.programInfo, sampleData.uniforms);
                twgl.drawBufferInfo(
                    gl,
                    this.bufferInfo,
                    gl.TRIANGLES,
                    range.count,
                    range.offset
                );
            }
        }
    }

    /**
     * @param {string} sampleId
     * @param {number} x position on the viewport
     * @param {number} y position on the viewport
     * @param {import("../utils/interval").default} yBand the matched band on the band scale
     */
    findDatum(sampleId, x, y, yBand) {}

    /**
     * Finds a datum that overlaps the given value on domain.
     * The result is unspecified if multiple datums are found.
     *
     * TODO: Rename the other findDatum to findSpec
     *
     * @param {string} sampleId
     * @param {number} x position on the x domain
     * @returns {object}
     */
    findDatumAt(sampleId, x) {}
}
