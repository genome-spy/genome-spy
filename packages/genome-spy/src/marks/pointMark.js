import fromEntries from "fromentries";
import * as twgl from "twgl.js";
import { extent, bisector } from "d3-array";
import { PointVertexBuilder } from "../gl/dataToVertices";
import VERTEX_SHADER from "../gl/point.vertex.glsl";
import FRAGMENT_SHADER from "../gl/point.fragment.glsl";

import Mark from "./mark";

const defaultMarkProperties = {
    xOffset: 0,
    yOffset: 0,

    /** TODO: Implement */
    relativeSizing: false,

    maxRelativePointDiameter: 0.8,
    minAbsolutePointDiameter: 0,

    geometricZoomBound: 0
};

/** @type {import("../view/viewUtils").EncodingSpecs} */
const defaultEncoding = {
    x: { value: 0 },
    y: { value: 0.5 },
    color: { value: "#1f77b4" },
    opacity: { value: 1.0 },
    size: { value: 100.0 },
    zoomThreshold: { value: 1.0 },
    shape: { value: "circle" },
    strokeWidth: { value: 0.7 },
    gradientStrength: { value: 0.0 }
};

// TODO: Configurable !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
const fractionToShow = 0.02;

export const SHAPES = fromEntries(
    [
        "circle",
        "square",
        "triangle-up",
        "cross",
        "diamond",
        "triangle-down",
        "triangle-right",
        "triangle-left"
    ].map((shape, i) => [shape, i])
);

export default class PointMark extends Mark {
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

    initializeData() {
        super.initializeData();

        const accessor = this.unitView.getAccessor("x");

        if (!accessor) {
            throw new Error("x channel is undefined!");
        }

        // Sort each point of each sample for binary search
        for (const arr of this.dataBySample.values()) {
            arr.sort((a, b) => accessor(a) - accessor(b));
        }
    }

    initializeEncoders() {
        super.initializeEncoders();
        const yScale = this.getScale("y", true);
        if (yScale && yScale.bandwidth) {
            const offset = yScale.bandwidth() / 2;
            const ye = this.encoders.y;
            this.encoders.y = d => ye(d) + offset;
        }
    }

    /**
     *
     * @param {WebGLRenderingContext} gl
     */
    initializeGraphics(gl) {
        super.initializeGraphics(gl);

        // A hack to support band scales

        this.programInfo = twgl.createProgramInfo(
            gl,
            [VERTEX_SHADER, FRAGMENT_SHADER].map(s => this.processShader(s))
        );

        const vertexCount =
            this.dataBySample.size === 1
                ? [...this.dataBySample.values()][0].length
                : undefined; // TODO: Sum all samples

        const builder = new PointVertexBuilder(this.encoders, vertexCount);

        for (const [sample, points] of this.dataBySample.entries()) {
            builder.addBatch(sample, points);
        }
        const vertexData = builder.toArrays();

        this.rangeMap = vertexData.rangeMap;
        this.bufferInfo = twgl.createBufferInfoFromArrays(
            this.gl,
            vertexData.arrays
        );
    }

    _getGeometricScaleFactor() {
        const zoomLevel = Math.pow(2, this.properties.geometricZoomBound || 0);

        return Math.pow(
            Math.min(
                1,
                this.getContext().genomeSpy.getExpZoomLevel() / zoomLevel
            ),
            1 / 3
        );
    }

    /**
     * Returns the maximum size of the points in the data, before any scaling
     */
    _getMaxPointSize() {
        const e = this.encoders.size;
        if (e.constant) {
            return e();
        } else {
            // TODO: encoder should provide an access to the scale
            return this.getScale("size")
                .range()
                .reduce((a, b) => Math.max(a, b));
        }
    }

    /**
     * @param {object[]} samples
     * @param {object} globalUniforms
     */
    render(samples, globalUniforms) {
        const gl = this.gl;
        const dpr = window.devicePixelRatio;

        gl.enable(gl.BLEND);
        gl.useProgram(this.programInfo.program);
        twgl.setUniforms(this.programInfo, {
            ...globalUniforms,
            uYTranslate: 0,
            uYScale: 1,
            uXOffset: (this.properties.xOffset / gl.drawingBufferWidth) * dpr,
            uYOffset: (this.properties.yOffset / gl.drawingBufferHeight) * dpr,
            uViewportHeight: gl.drawingBufferHeight,
            uDevicePixelRatio: dpr,
            uMaxRelativePointDiameter: this.properties.maxRelativePointDiameter,
            uMinAbsolutePointDiameter: this.properties.minAbsolutePointDiameter,
            uMaxPointSize: this._getMaxPointSize(),
            uScaleFactor: this._getGeometricScaleFactor(),
            fractionToShow: fractionToShow // TODO: Configurable
        });

        twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);

        const bisect = bisector(this.encoders.x.accessor).left;
        const visibleDomain = this.getContext().genomeSpy.getViewportDomain();
        // A hack to include points that are just beyond the borders. TODO: Compute based on maxPointSize
        const paddedDomain = visibleDomain.pad(visibleDomain.width() * 0.01);

        for (const sampleData of samples) {
            const range = this.rangeMap.get(sampleData.sampleId);
            if (range) {
                // Render only points that reside inside the viewport
                const specs = this.dataBySample.get(sampleData.sampleId);
                const lower = bisect(specs, paddedDomain.lower);
                const upper = bisect(specs, paddedDomain.upper);
                const length = upper - lower;

                if (length) {
                    twgl.setUniforms(this.programInfo, sampleData.uniforms);
                    twgl.drawBufferInfo(
                        gl,
                        this.bufferInfo,
                        gl.POINTS,
                        length,
                        range.offset + lower
                    );
                }
            }
        }
    }

    /**
     * @param {string} sampleId
     * @param {number} x position on the viewport
     * @param {number} y position on the viewport
     * @param {import("../utils/interval").default} yBand the matched band on the band scale
     */
    findDatum(sampleId, x, y, yBand) {
        const data = this.dataBySample.get(sampleId || "default");
        if (!data) {
            return null;
        }

        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (this
            .encoders);

        x -= this.properties.xOffset;
        y += this.properties.yOffset;

        // TODO: This unmaintainable mess should really be replaced with picking
        const maxPointDiameter = Math.sqrt(this._getMaxPointSize());
        const factor =
            Math.max(
                this.properties.minAbsolutePointDiameter,
                Math.min(
                    yBand.width() * this.properties.maxRelativePointDiameter,
                    maxPointDiameter
                )
            ) / maxPointDiameter;

        const sizeScaleFactor = this._getGeometricScaleFactor() * factor;

        const distance = (x1, x2, y1, y2) =>
            Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        const xScale = this.getContext().genomeSpy.rescaledX;

        const bisect = bisector(e.x).left;
        // Use binary search to find the range that may contain the point
        const begin = bisect(
            data,
            xScale.invert(x - (maxPointDiameter / 2) * sizeScaleFactor)
        );
        const end = bisect(
            data,
            xScale.invert(x + (maxPointDiameter / 2) * sizeScaleFactor)
        );

        const margin = 0.005; // TODO: Configurable
        const threshold =
            this.getContext().genomeSpy.getExpZoomLevel() * fractionToShow;
        const thresholdWithMargin = threshold * (1 + margin);

        let lastMatch = null;
        for (let i = begin; i < end; i++) {
            const d = data[i];
            if (1 - e.zoomThreshold(d) < thresholdWithMargin) {
                // TODO: Optimize by computing mouse y on the band scale
                const dist = distance(
                    x,
                    xScale(e.x(d)),
                    y,
                    yBand.interpolate(1 - e.y(d))
                );
                if (dist < (sizeScaleFactor * Math.sqrt(e.size(d))) / 2) {
                    lastMatch = d;
                }
            }
            // TODO: If exact match wasn't found, return the closest match within a radius of a couple of pixels
        }

        return lastMatch;
    }
}

/**
 * https://www.wikiwand.com/en/Smoothstep
 *
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 */
function smoothstep(edge0, edge1, x) {
    // Scale, bias and saturate x to 0..1 range
    x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    // Evaluate polynomial
    return x * x * (3 - 2 * x);
}

/**
 *
 * @param {number} x
 * @param {number} lowerlimit
 * @param {number} upperlimit
 */
function clamp(x, lowerlimit, upperlimit) {
    if (x < lowerlimit) x = lowerlimit;
    if (x > upperlimit) x = upperlimit;
    return x;
}
