import { group } from "d3-array";
import { getPlatformShaderDefines } from "../gl/includes/fp64-utils";
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

        for (const channel in configured) {
            if (typeof defaults[channel] !== "object") {
                throw new Error(
                    `Unsupported channel "${channel}" in ${this.getType()}'s encoding: ${JSON.stringify(
                        configured
                    )}`
                );
            }
        }

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
        const scaleSource = channel => {
            const resolution = this.unitView.getResolution(channel);
            if (resolution) {
                return resolution.getScale();
            }
        };

        // TODO: Consider putting encoders to unitView
        this.encoders = createEncoders(encoding, scaleSource, scale =>
            this.unitView.getAccessor(scale)
        );
    }

    /**
     *
     * @param {WebGLRenderingContext} gl
     */
    initializeGraphics(gl) {
        // override
        this.gl = gl;
        this._shaderDefines = getPlatformShaderDefines(gl);
    }

    /**
     * @param {string} shaderCode
     */
    processShader(shaderCode) {
        return this._shaderDefines + "\n" + shaderCode;
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
                `Cannot find a resolved scale for channel "${channel}" at ${this.unitView.getPathString()} (${this.getType()})`
            );
        }
    }

    /**
     * @param {object[]} samples
     * @param {object} globalUniforms
     */
    render(samples, globalUniforms) {
        // override
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
