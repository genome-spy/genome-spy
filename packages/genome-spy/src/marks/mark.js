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

export default class Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        this.unitView = unitView;
        /** @type {Record<string, any>} */
        this.properties =
            typeof unitView.spec.mark == "object" ? unitView.spec.mark : {};

        /** @type {Record<string, import("../encoder/encoder").Encoder>} */
        this.encoders = undefined;

        /** @type {twgl.BufferInfo} WebGL buffers */
        this.bufferInfo = undefined;

        /** @type {twgl.ProgramInfo} WebGL buffers */
        this.programInfo = undefined;
    }

    /**
     * Returns attributes that are uploaded to the GPU as raw data.
     *
     * Note: attributes and channels do not necessarily match.
     * For example, rectangles have x, y, x2, and y2 channels but only x and y as attributes.
     *
     * @typedef {Object} RawChannelProps
     * @prop {boolean} [complexGeometry] The mark consists of multiple vertices that are rendered
     *      without instancing. Thus, constant values must be provided as attributes. Default: false
     * @prop {boolean} [fp64] Use emulated 64bit floats.
     *
     * @returns {Record<string, RawChannelProps>}
     */
    getRawAttributes() {
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
        // TODO: Validate that all required channels are covered with encoders
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
        const attributes = this.getRawAttributes();
        const glsl = Object.keys(attributes)
            .filter(attr => attr in e)
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
                        "datum" in e[attr]
                            ? /** @type {number} */ (e[attr].datum)
                            : undefined // TODO: fp64
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
            Object.values(this.bufferInfo.attribs).forEach(attribInfo =>
                this.gl.deleteBuffer(attribInfo.buffer)
            );
            if (this.bufferInfo.indices) {
                this.gl.deleteBuffer(this.bufferInfo.indices);
            }
            this.bufferInfo = undefined;
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
     * @param {object[]} samples
     */
    render(samples) {
        // override

        this.gl.useProgram(this.programInfo.program);
        this.setViewport(this.programInfo);

        /** @type {Record<string, number | number[]>} */
        const uniforms = {};
        for (const channel of ["x", "y", "size"]) {
            const resolution = this.unitView.getResolution(channel);
            if (resolution) {
                uniforms[DOMAIN_PREFIX + channel] = ["band", "point"].includes(
                    resolution.getScale().type
                )
                    ? [0, 1]
                    : resolution.getDomain();
            }
        }

        twgl.setUniforms(this.programInfo, this.getGlobalUniforms());
        twgl.setUniforms(this.programInfo, uniforms);
    }

    getGlobalUniforms() {
        /** @param {string} channel */
        const getZoomLevel = channel => {
            // TODO: Replace this with optional chaining (?.) when webpack can handle it
            const resolution = this.unitView.getResolution(channel);
            return resolution ? resolution.getZoomLevel() : 0;
        };

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

        const coords = this.unitView.getCoords();
        const logicalSize = this.glHelper.getLogicalCanvasSize();

        const physicalGlCoords = [
            coords.x,
            logicalSize.height - coords.y2,
            coords.width,
            coords.height
        ].map(x => x * dpr);

        // @ts-ignore

        if (this.properties.clip) {
            // @ts-ignore
            gl.viewport(...physicalGlCoords);
            // @ts-ignore
            gl.scissor(...physicalGlCoords);
            gl.enable(gl.SCISSOR_TEST);

            twgl.setUniforms(programInfo, {
                uViewOffset: [0, 0],
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
                    coords.x / logicalSize.width,
                    (logicalSize.height - coords.y - coords.height) /
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

    /**
     * @param {string} sampleId
     * @param {number} x position on the range
     * @param {number} y position on the range
     * @param {import("../utils/interval").default} yBand the matched band on the band scale
     */
    findDatum(sampleId, x, y, yBand) {
        return null;
    }
}
