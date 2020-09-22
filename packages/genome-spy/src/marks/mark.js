import { group } from "d3-array";
import { fp64ify } from "../gl/includes/fp64-utils";
import * as twgl from "twgl.js";
import Interval from "../utils/interval";
import createEncoders from "../encoder/encoder";

export default class Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        this.unitView = unitView;
        /** @type {Record<string, any>} */
        this.properties =
            typeof unitView.spec.mark == "object" ? unitView.spec.mark : {};

        /** @type {twgl.BufferInfo} WebGL buffers */
        this.bufferInfo = undefined;
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

    initializeEncoders() {
        const encoding = this.getEncoding();

        /** @type {function(string):function} */
        const scaleSource = channel => this.getScale(channel, true);

        // TODO: Consider putting encoders to unitView
        this.encoders = createEncoders(encoding, scaleSource, channel =>
            this.unitView.getAccessor(channel)
        );
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
    async updateGraphicsData() {
        // override
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
     * TODO: Abstract away!
     */
    getYDomain() {
        // TODO: Get rid of the Interval
        return Interval.fromArray(this.getScale("y").domain());
    }

    /**
     * TODO: Abstract away!
     */
    getXDomain() {
        return this.getContext().genomeSpy.getDomain();
    }

    /**
     * Returns a resolved scale for the given channel
     *
     * @param {string} channel
     * @param {boolean} acceptMissing Don't throw on missing scale
     */
    getScale(channel, acceptMissing = false) {
        const resolution = this.unitView.getResolution(channel);
        if (resolution) {
            return resolution.getScale();
        } else if (!acceptMissing) {
            throw new Error(
                `Cannot find a resolved scale for channel "${channel}" at ${this.unitView.getPathString()} (mark: ${this.getType()})`
            );
        }
    }

    /**
     * @param {object[]} samples
     */
    render(samples) {
        // override
    }

    getDomainUniforms() {
        const domain = this.getContext().genomeSpy.getViewportDomain();

        return {
            uXScale: fp64ify(1.0 / domain.width()),
            uXTranslate: fp64ify(-domain.lower / domain.width()),
            ONE: 1.0
        };
    }

    getGlobalUniforms() {
        return {
            ...this.getDomainUniforms(),
            uDevicePixelRatio: window.devicePixelRatio,
            zoomLevel: this.getContext().genomeSpy.getExpZoomLevel()
        };
    }

    /**
     * Sets viewport, clipping, and uniforms related to scaling and translation
     *
     * @param {twgl.ProgramInfo} programInfo
     */
    setViewport(programInfo) {
        const dpr = window.devicePixelRatio;
        const gl = this.gl;

        const locSize = this.unitView.getCoords();
        const logicalSize = this.glHelper.getLogicalCanvasSize();

        const width = gl.drawingBufferWidth / dpr;
        const height = locSize.size;

        const clip = true;

        const physicalGlCoords = [
            0,
            (logicalSize.height - locSize.location - height) * dpr,
            width * dpr,
            locSize.size * dpr
        ];

        // @ts-ignore
        gl.viewport(...physicalGlCoords);

        if (clip) {
            // @ts-ignore
            gl.scissor(...physicalGlCoords);
            gl.enable(gl.SCISSOR_TEST);
        } else {
            gl.disable(gl.SCISSOR_TEST);
        }

        twgl.setUniforms(programInfo, {
            uDevicePixelRatio: window.devicePixelRatio,
            uViewportSize: [width, height]
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
