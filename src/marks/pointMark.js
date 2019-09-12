import * as twgl from 'twgl-base.js';
import mapsort from 'mapsort';
import { extent, bisector } from 'd3-array';
import { PointVertexBuilder } from '../gl/segmentsToVertices';
import VERTEX_SHADER from '../gl/point.vertex.glsl';
import FRAGMENT_SHADER from '../gl/point.fragment.glsl';

import Mark from './mark';


// TODO: Style object
const defaultRenderConfig = {
    // Fraction of sample height
    maxPointSizeRelative: 0.8,
    // In pixels
    maxMaxPointSizeAbsolute: 25,
    // In pixels
    minMaxPointSizeAbsolute: 4.5,
    // TODO: Compute default based on the number of data
    zoomLevelForMaxPointSize: 1.0
};

/** @type {import("../view/viewUtils").EncodingSpecs} */
const defaultEncoding = {
    x:                { value: 0 },
    y:                { value: 0.5 },
    color:            { value: "#1f77b4" },
    opacity:          { value: 1.0 },
    size:             { value: 1.0 },
    zoomThreshold:    { value: 1.0 },
    shape:            { value: "circle" },
    strokeWidth:      { value: 0.7 },
    gradientStrength: { value: 0.0 }
};

// TODO: Configurable !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
const fractionToShow = 0.02;

export const SHAPES = Object.fromEntries([
    "circle",
    "square",
    "triangle-up",
    "cross",
    "diamond",
    "triangle-down",
    "triangle-right",
    "triangle-left"
].map((shape, i) => [shape, i]));

export default class PointMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView)
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }


    async initializeData() {
        await super.initializeData();

        const accessor = this.unitView.getAccessor("x");
        
        // Sort each point of each sample for binary search
        /** @type {Map<string, object[]>} */
        this.dataBySample = new Map([...this.dataBySample.entries()].map(e =>
            [e[0], mapsort(e[1], accessor, (a, b) => a - b)]));
    }


    initializeGraphics() {
        super.initializeGraphics();
        const gl = this.gl;

        this.programInfo = twgl.createProgramInfo(gl, [ VERTEX_SHADER, FRAGMENT_SHADER ]);

        const vertexCount = this.dataBySample.size === 1 ? [...this.dataBySample.values()][0].length : undefined; // TODO: Sum all samples

        const builder = new PointVertexBuilder(this.encoders, vertexCount);

        for (const [sample, points] of this.dataBySample.entries()) {
            builder.addBatch(sample, points);
        }
        const vertexData = builder.toArrays();

        this.rangeMap = vertexData.rangeMap;
        this.bufferInfo = twgl.createBufferInfoFromArrays(this.gl, vertexData.arrays);

        this.renderConfig = Object.assign({}, defaultRenderConfig, this.unitView.getRenderConfig());
    }

    getMaxMaxPointSizeAbsolute() {
        const zoomLevel = this.renderConfig.zoomLevelForMaxPointSize;

        const min = this.renderConfig.minMaxPointSizeAbsolute;
        const max = this.renderConfig.maxMaxPointSizeAbsolute;

        const initial = Math.pow(min / max, 3);

        let maxPointSizeAbsolute = 
            Math.pow(Math.min(1, this.getContext().genomeSpy.getExpZoomLevel() / zoomLevel + initial), 1 / 3) * max;

        return maxPointSizeAbsolute;
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
            //uYDomainBegin: yDomain.lower,
            uYDomainBegin: 0,
            //uYDomainWidth: yDomain.width(),
            uYDomainWidth: 1,
            uXOffset: (this.renderConfig.xOffset || 0.0) / gl.drawingBufferWidth * window.devicePixelRatio,
            uYOffset: (this.renderConfig.yOffset || 0.0) / gl.drawingBufferHeight * window.devicePixelRatio,
            viewportHeight: this.getContext().track.glCanvas.clientHeight,
            devicePixelRatio: window.devicePixelRatio,
            maxPointSizeRelative: this.renderConfig.maxPointSizeRelative,
            maxMaxPointSizeAbsolute: this.getMaxMaxPointSizeAbsolute(),
            minMaxPointSizeAbsolute: this.renderConfig.minMaxPointSizeAbsolute,
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
                    twgl.drawBufferInfo(gl, this.bufferInfo, gl.POINTS, length, range.offset + lower);
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

        const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */(this.encoders);

        x -= (this.renderConfig.xOffset || 0.0);
        y += (this.renderConfig.yOffset || 0.0);

        // TODO: Extract a method for maxPointSize and use it in the render method too
        const maxPointSize = Math.max(
            this.renderConfig.minMaxPointSizeAbsolute,
            Math.min(this.getMaxMaxPointSizeAbsolute(), this.renderConfig.maxPointSizeRelative * yBand.width()));

        const distance = (x1, x2, y1, y2) => Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        const xScale = this.getContext().track.genomeSpy.rescaledX;

        const bisect = bisector(e.x).left;
        // Use binary search to find the range that may contain the point
        const begin = bisect(data, xScale.invert(x - maxPointSize / 2));
        const end = bisect(data, xScale.invert(x + maxPointSize / 2));

        const margin = 0.005; // TODO: Configurable
        const threshold = this.getContext().genomeSpy.getExpZoomLevel() * fractionToShow;
        const thresholdWithMargin = threshold * (1 + margin);

        let lastMatch = null;
        for (let i = begin; i < end; i++) {
            const d = data[i];
            if (1 - e.zoomThreshold(d) < thresholdWithMargin) {
                // TODO: Optimize by computing mouse y on the band scale
                const dist = distance(x, xScale(e.x(d)), y, yBand.interpolate(1 - e.y(d)));
                if (dist < maxPointSize * Math.sqrt(e.size(d)) / 2) {
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
    if (x < lowerlimit)
        x = lowerlimit;
    if (x > upperlimit)
        x = upperlimit;
    return x;
}