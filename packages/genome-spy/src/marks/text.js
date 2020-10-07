import { isString } from "vega-util";
import { format } from "d3-format";
import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/text.vertex.glsl";
import FRAGMENT_SHADER from "../gl/text.fragment.glsl";
import { TextVertexBuilder } from "../gl/dataToVertices";
import fontUrl from "../fonts/Lato-Regular.png";
import fontMetadata from "../fonts/Lato-Regular.json";

import Mark from "./mark";

/** @type {import("../spec/view").EncodingConfigs} */
const defaultEncoding = {
    x: { value: 0.5 },
    y: { value: 0.5 },
    x2: undefined,
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
    }

    getAttributes() {
        return {
            x: { raw: true },
            x2: { raw: true },
            y: { raw: true },
            color: {},
            size: { raw: true },
            opacity: { raw: true }
        };
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),
            align: "center",
            baseline: "middle",
            dx: 0,
            dy: 0,
            angle: 0
        };
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

        this.createShaders(VERTEX_SHADER, FRAGMENT_SHADER);

        return texturePromise;
    }

    updateGraphicsData() {
        const encoding = this.getEncoding();

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

        for (const [sample, texts] of this.dataBySample.entries()) {
            builder.addBatch(sample, texts);
        }
        const vertexData = builder.toArrays();
        this.rangeMap = vertexData.rangeMap;

        this.updateBufferInfo(vertexData);
    }

    /**
     * @param {import("./mark").SampleToRender[]} samples
     */
    render(samples) {
        super.render(samples);

        const dpr = window.devicePixelRatio;
        const gl = this.gl;
        const props = this.properties;

        twgl.setUniforms(this.programInfo, {
            uTexture: this.fontTexture,
            uD: [props.dx, -props.dy],
            uPaddingX: 4.0, // TODO: Configurable
            uAlign: alignments[props.align],
            uAngle: (-props.angle / 180) * Math.PI,
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
}
