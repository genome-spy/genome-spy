import { group } from "d3-array";
import { fp64ify } from "../gl/includes/fp64-utils";
import * as twgl from "twgl.js";
import Interval from "../utils/interval";
import createEncoders from "../encoder/encoder";
import { DOMAIN_PREFIX } from "../scale/glslScaleGenerator";
import {
    generateValueGlsl,
    generateScaleGlsl
} from "../scale/glslScaleGenerator";

/**
 *
 * @typedef {object} SampleToRender
 * @prop {string} sampleId
 * @prop {Record<string, any>} uniforms
 *
 * @typedef {Object} AttributeProps
 * @prop {boolean} [complexGeometry] The mark consists of multiple vertices that are rendered
 *      without instancing. Thus, constant values must be provided as attributes. Default: false
 * @prop {boolean} [raw] Data is uploaded to the GPU memory as is, i.e., not scale transformed.
 *      Default: false
 */
export default class Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        this.unitView = unitView;

        /** @type {Record<string, import("../encoder/encoder").Encoder>} */
        this.encoders = undefined;

        /** @type {twgl.BufferInfo & { allocatedVertices?: number }} WebGL buffers */
        this.bufferInfo = undefined;

        /** @type {twgl.ProgramInfo} WebGL buffers */
        this.programInfo = undefined;

        this.opaque = false;
    }

    /**
     * Returns attribute info for WebGL attributes that match visual channels.
     *
     * Note: attributes and channels do not necessarily match.
     * For example, rectangles have x, y, x2, and y2 channels but only x and y as attributes.
     *
     * @returns {Record<string, AttributeProps>}
     */
    getAttributes() {
        // override
        throw new Error("Not implemented!");
    }

    /**
     * @returns {import("../spec/view").EncodingConfigs}
     */
    getDefaultEncoding() {
        return {
            sample: null
        };
    }

    /**
     * @returns {Record<string, any>}
     */
    getDefaultProperties() {
        // TODO: Implement https://vega.github.io/vega-lite/docs/config.html
        return {
            clip: true,
            xOffset: 0,
            yOffset: 0,

            /**
             * Minimum size for WebGL buffers (number of data items).
             * Allows for using bufferSubData to update graphics.
             * This property is intended for internal usage.
             */
            minBufferSize: 0
        };
    }

    /**
     * Returns the encoding spec supplemented with mark's default encodings
     * @returns {import("../spec/view").EncodingConfigs}
     */
    getEncoding() {
        const defaults = this.getDefaultEncoding();
        const configured = this.unitView.getEncoding();

        /*
        // TODO: Figure out a way to log a warning only once. After that, enable this check:
        for (const channel in configured) {
            if (typeof defaults[channel] !== "object") {
                // TODO: Only warn if the channel was not inherited
                console.warn(
                    `Unsupported channel "${channel}" in ${this.getType()}'s encoding: ${JSON.stringify(
                        configured
                    )}`
                );
            }
        }
        */

        return { ...defaults, ...configured };
    }

    /**
     * @returns {Record<string, any>}
     */
    getProperties() {
        return {
            ...this.getDefaultProperties(),
            ...(typeof this.unitView.spec.mark == "object"
                ? this.unitView.spec.mark
                : {})
        };
    }

    getContext() {
        return this.unitView.context;
    }

    getType() {
        return this.unitView.getMarkType();
    }

    initializeData() {
        // TODO: Consider putting initializeData to unitView

        const data = this.unitView.getData();
        if (!data) {
            // TODO: Show view path in error
            throw new Error("Can not initialize mark, no data available!");
        }

        const accessor = this.unitView.getAccessor("sample");
        if (accessor) {
            // TODO: Optimize. Now inherited data is grouped by sample in all children
            /** @type {Map<string, object[]>} */
            this.dataBySample = group(data.flatData(), accessor);
        } else {
            this.dataBySample = new Map([["default", data.ungroupAll().data]]);
        }
    }

    /**
     * Initialize encoders that encode fields of the data (or constants) to
     * the ranges of the visual channels.
     */
    initializeEncoders() {
        this.encoders = createEncoders(this);
    }

    /**
     * Initialize shaders etc.
     */
    async initializeGraphics() {
        //override
    }

    /**
     * Update WebGL buffers from the data
     */
    updateGraphicsData() {
        // override
    }

    /**
     *
     * @param {string} vertexShader
     * @param {string} fragmentShader
     * @param {string[]} [extraHeaders]
     */
    createShaders(vertexShader, fragmentShader, extraHeaders = []) {
        const e = this.getEncoding();
        const attributes = this.getAttributes();
        const glsl = Object.keys(attributes)
            .filter(attr => attributes[attr].raw && e[attr])
            .map(attr => {
                if ("value" in e[attr]) {
                    if (!attributes[attr].complexGeometry) {
                        return generateValueGlsl(
                            attr,
                            /** @type {number} */ (e[attr].value)
                        );
                    } else {
                        return generateScaleGlsl(attr, { type: "identity" });
                    }
                } else {
                    return generateScaleGlsl(
                        attr,
                        this.unitView.getResolution(attr).getScale(),
                        {
                            ...("datum" in e[attr]
                                ? {
                                      datum: /** @type {number} */ (+e[attr]
                                          .datum)
                                  }
                                : {})
                        }
                    );
                }
            })
            .join("\n");

        const vertexShaderWithScales = /** @type {string} */ (vertexShader).replace(
            "#pragma SCALES_HERE",
            glsl
        );

        //console.log(glsl);
        this.programInfo = twgl.createProgramInfo(
            this.gl,
            this.glHelper.processShader(
                vertexShaderWithScales,
                fragmentShader,
                extraHeaders
            )
        );
    }

    /**
     * Delete WebGL buffers etc.
     */
    deleteGraphicsData() {
        if (this.bufferInfo) {
            const gl = this.gl;
            // A hack to prevent WebGL: INVALID_OPERATION: drawArrays: no buffer is bound to enabled attribute
            // TODO: Consider using bufferSubData or DYNAMIC_DRAW etc...
            for (let i = 0; i < 8; i++) {
                gl.disableVertexAttribArray(i);
            }

            Object.values(this.bufferInfo.attribs).forEach(attribInfo =>
                this.gl.deleteBuffer(attribInfo.buffer)
            );
            if (this.bufferInfo.indices) {
                this.gl.deleteBuffer(this.bufferInfo.indices);
            }
            this.bufferInfo = undefined;
        }
    }

    /**
     *
     * @param {any} vertexData TODO: Extract type from VertexBuilder
     */
    updateBufferInfo(vertexData) {
        if (
            this.bufferInfo &&
            vertexData.vertexCount <= this.bufferInfo.allocatedVertices
        ) {
            for (const [attribute, attributeData] of Object.entries(
                vertexData.arrays
            )) {
                // Skip constants
                if (attributeData.data) {
                    // TODO: Check that all attributes and numComponents match
                    twgl.setAttribInfoBufferFromArray(
                        this.gl,
                        this.bufferInfo.attribs[attribute],
                        attributeData.data,
                        0
                    );
                }
            }
        } else {
            this.deleteGraphicsData();
            this.bufferInfo = twgl.createBufferInfoFromArrays(
                this.gl,
                vertexData.arrays,
                { numElements: vertexData.vertexCount }
            );
            this.bufferInfo.allocatedVertices = vertexData.allocatedVertices;
        }
    }

    /** Convenience method */
    get glHelper() {
        return this.getContext().glHelper;
    }

    /** Convenience method */
    get gl() {
        return this.glHelper.gl;
    }

    onBeforeSampleAnimation() {
        // override
    }

    onAfterSampleAnimation() {
        // override
    }

    /**
     * @param {SampleToRender[]} samples
     */
    render(samples) {
        // override

        const gl = this.gl;

        gl.useProgram(this.programInfo.program);
        this.setViewport(this.programInfo);

        /** @type {Record<string, number | number[]>} */
        const domainUniforms = {};
        for (const channel of Object.keys(this.getAttributes())) {
            const resolution = this.unitView.getResolution(channel);
            if (resolution) {
                const scale = resolution.getScale();
                const domain = ["band", "point"].includes(scale.type)
                    ? [0, 1]
                    : resolution.getDomain();

                domainUniforms[DOMAIN_PREFIX + channel] = scale.fp64
                    ? domain.map(x => fp64ify(x)).flat()
                    : domain;
            }
        }

        twgl.setUniforms(this.programInfo, this.getGlobalUniforms());
        twgl.setUniforms(this.programInfo, domainUniforms);

        if (this.opaque) {
            gl.disable(gl.BLEND);
        } else {
            gl.enable(gl.BLEND);
        }
    }

    getGlobalUniforms() {
        return {
            ONE: 1.0,
            uDevicePixelRatio: window.devicePixelRatio
        };
    }

    /**
     * Sets viewport, clipping, and uniforms related to scaling and translation
     *
     * TODO: Viewport should be handled at the view level
     *
     * @param {twgl.ProgramInfo} programInfo
     */
    setViewport(programInfo) {
        const dpr = window.devicePixelRatio;
        const gl = this.gl;
        const props = this.getProperties();

        const coords = this.unitView.getCoords();
        const logicalSize = this.glHelper.getLogicalCanvasSize();

        const physicalGlCoords = [
            coords.x,
            logicalSize.height - coords.y2,
            coords.width,
            coords.height
        ].map(x => x * dpr);

        // @ts-ignore

        // Note: we also handle xOffset/yOffset mark properties here
        const xOffset = props.xOffset || 0;
        const yOffset = -props.yOffset || 0;

        if (props.clip) {
            // @ts-ignore
            gl.viewport(...physicalGlCoords);
            // @ts-ignore
            gl.scissor(...physicalGlCoords);
            gl.enable(gl.SCISSOR_TEST);

            twgl.setUniforms(programInfo, {
                uViewOffset: [xOffset / coords.width, -yOffset / coords.height],
                uViewScale: [1, 1]
            });
        } else {
            // Viewport comprises of the full canvas
            gl.viewport(
                0,
                0,
                logicalSize.width * dpr,
                logicalSize.height * dpr
            );
            gl.disable(gl.SCISSOR_TEST);

            // Offset and scale all drawing to the view rectangle
            twgl.setUniforms(programInfo, {
                uViewOffset: [
                    (coords.x + xOffset) / logicalSize.width,
                    (logicalSize.height - coords.y - yOffset - coords.height) /
                        logicalSize.height
                ],
                uViewScale: [
                    coords.width / logicalSize.width,
                    coords.height / logicalSize.height
                ]
            });
        }

        twgl.setUniforms(programInfo, {
            uDevicePixelRatio: window.devicePixelRatio,
            uViewportSize: [coords.width, coords.height]
        });
    }
}
