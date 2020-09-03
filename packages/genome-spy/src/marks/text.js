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
    size: { value: 11.0 },
    color: { value: "black" },
    opacity: { value: 1.0 }
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

    /**
     *
     * @param {WebGLRenderingContext} gl
     */
    initializeGraphics(gl) {
        super.initializeGraphics(gl);

        this.programInfo = twgl.createProgramInfo(
            gl,
            [VERTEX_SHADER, FRAGMENT_SHADER].map(s => this.processShader(s))
        );

        this.fontTexture = twgl.createTexture(gl, {
            src: fontUrl,
            min: gl.LINEAR
        }); // TODO: handle Callback

        const builder = new TextVertexBuilder(
            this.encoders,
            fontMetadata,
            this.properties
        );

        for (const [sample, connections] of this.dataBySample.entries()) {
            builder.addBatch(sample, connections);
        }
        const vertexData = builder.toArrays();

        this.rangeMap = vertexData.rangeMap;
        this.bufferInfo = twgl.createBufferInfoFromArrays(
            this.gl,
            vertexData.arrays
        );
    }

    /**
     * @param {object[]} samples
     * @param {object} globalUniforms
     */
    render(samples, globalUniforms) {
        const gl = this.gl;

        gl.enable(gl.BLEND);

        gl.useProgram(this.programInfo.program);
        twgl.setUniforms(this.programInfo, {
            ...globalUniforms,
            uYTranslate: 0,
            uYScale: 1,
            uTexture: this.fontTexture,
            uD: [this.properties.dx, -this.properties.dy],
            uSdfNumerator:
                /** @type {import("../fonts/types").FontMetadata}*/ (fontMetadata)
                    .common.base *
                window.devicePixelRatio *
                0.1 // TODO: Ensure that this makes sense. Now chosen by trial & error
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
