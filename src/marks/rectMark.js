import * as twgl from 'twgl-base.js';
import { extent } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import VERTEX_SHADER from '../gl/rect.vertex.glsl';
import FRAGMENT_SHADER from '../gl/rect.fragment.glsl';
import { RectVertexBuilder } from '../gl/segmentsToVertices';

import Mark from './mark';
import Interval from '../utils/interval';

const defaultRenderConfig = {
    minRectWidth: 1.0,
    minRectHeight: 0.0,
    minRectOpacity: 0.0,
    xOffset: 0.0,
    yOffset: 0.0
};

/** @type {import("../view/viewUtils").EncodingSpecs} */
const defaultEncoding = {
    x:       { value: 0 },
    x2:      { value: 0 },
    y:       { value: 0 },
    y2:      { value: 1.0 }, // full-height bars
    color:   { value: "#1f77b4" },
    opacity: { value: 1.0 },
};

const tesselationConfig = {
    zoomThreshold: 10, // This works with genomes, but likely breaks with other data. TODO: Fix
    tiles: 35
};

export default class RectMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView)

        // TODO: Check renderConfig.rectMinOpacity
        this.opaque = this.getEncoding().opacity.value >= 1.0;
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    onBeforeSampleAnimation() {
        const interval = this.getContext().genomeSpy.getViewportDomain();

        if (interval.width() < this.getContext().genomeSpy.getDomain().width() / tesselationConfig.zoomThreshold) {
            // TODO: Only bufferize the samples that are being animated
            this._sampleBufferInfo = this._createSampleBufferInfo(interval,
                interval.width() / tesselationConfig.tiles);
        }            

    }

    onAfterSampleAnimation() {
        this._sampleBufferInfo = this._fullSampleBufferInfo;
    }

    /**
     * 
     * @param {import("../utils/interval").default} [interval]
     * @param {number} [tesselationThreshold]
     */
    _createSampleBufferInfo(interval, tesselationThreshold) {
        // TODO: Disable tesselation on SimpleTrack - no need for it
        const builder = new RectVertexBuilder(this.encoders, tesselationThreshold, {});

        for (const [sample, data] of this.dataBySample.entries()) {
            //builder.addBatch(sample, interval ? clipRects(rects, interval) : rects);
            // TODO: clipRects!
            builder.addBatch(sample, data);
        }
        const vertexData = builder.toArrays();

        return {
            rangeMap: vertexData.rangeMap,
            bufferInfo: twgl.createBufferInfoFromArrays(this.gl, vertexData.arrays)
        };
    }

    initializeGraphics() {
        super.initializeGraphics();
        const gl = this.gl;

        const xDomain = this.getXDomain();
        const domainWidth = xDomain ? xDomain.width() : Infinity;

        // TODO: const domainWidth = this.unitContext.genomeSpy.getDomain().width();
        // But it requires that all data are first loaded in order to extract the domain

        this.programInfo = twgl.createProgramInfo(gl, [ VERTEX_SHADER, FRAGMENT_SHADER ]);

        this._fullSampleBufferInfo = this._createSampleBufferInfo(null,
            domainWidth / tesselationConfig.zoomThreshold / tesselationConfig.tiles);
        this._sampleBufferInfo = this._fullSampleBufferInfo;

        this.renderConfig = {
            ...defaultRenderConfig,
            ...this.unitView.getRenderConfig()
        };
    }

    /**
     * @param {object[]} samples 
     * @param {object} globalUniforms 
     */
    render(samples, globalUniforms) {
        const gl = this.gl;

        if (this.opaque) {
            gl.disable(gl.BLEND);
        } else {
            gl.enable(gl.BLEND);
        }

        const yDomain = /** @type {Interval} */(this.getYDomain());
        

        gl.useProgram(this.programInfo.program);
        twgl.setUniforms(this.programInfo, {
            ...globalUniforms,
            //uYDomainBegin: yDomain.lower,
            uYDomainBegin: 0,
            //uYDomainWidth: yDomain.width(),
            uYDomainWidth: 1,
            uMinWidth: (this.renderConfig.minRectWidth || 1.0) / gl.drawingBufferWidth * window.devicePixelRatio, // How many pixels
            uMinHeight : (this.renderConfig.minRectHeight || 0.0) / gl.drawingBufferHeight * window.devicePixelRatio, // How many pixels
            uMinOpacity: this.renderConfig.minRectOpacity || 0.0,
            uXOffset: (this.renderConfig.xOffset || 0.0) / gl.drawingBufferWidth * window.devicePixelRatio,
            uYOffset: (this.renderConfig.yOffset || 0.0) / gl.drawingBufferHeight * window.devicePixelRatio,
        });

        twgl.setBuffersAndAttributes(gl, this.programInfo, this._sampleBufferInfo.bufferInfo);

        for (const sampleData of samples) {
            const range = this._sampleBufferInfo.rangeMap.get(sampleData.sampleId);
            if (range) {
                twgl.setUniforms(this.programInfo, sampleData.uniforms);
                // TODO: draw only the part that intersects with the viewport
                twgl.drawBufferInfo(gl, this._sampleBufferInfo, gl.TRIANGLE_STRIP, range.count, range.offset);
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
        const rects = this.dataBySample.get(sampleId || "default");

        const gl = this.getContext().track.gl;
        const dpr = window.devicePixelRatio;

        x -= (this.renderConfig.xOffset || 0.0);
        y += (this.renderConfig.yOffset || 0.0);

        if (rects) {
            const yDomain = this.getYDomain(); // Could be cached...

            const unitMinWidth = this.renderConfig.minRectWidth / gl.drawingBufferWidth * dpr;
            const halfMinWidth = unitMinWidth * this.getContext().genomeSpy.getViewportDomain().width() / 2;

            const unitMinHeight = this.renderConfig.minRectHeight / gl.drawingBufferHeight * dpr;
            const halfMinHeight = unitMinHeight * yDomain.width() / 2; // TODO: take yBand into account

            const scaledX = this.getContext().genomeSpy.rescaledX.invert(x);

            const yScale = scaleLinear()
                .domain(yDomain.toArray())
                .range([0, 1]);

            const scaledY = yScale.invert(1 - (y - yBand.lower) / yBand.width());

            const matchX = this.renderConfig.minRectWidth ?
                rect => {
                    const halfWidth = Math.max((rect.x2 - rect.x) / 2, halfMinWidth);
                    const centre = (rect.x + rect.x2) / 2;

                    return scaledX >= centre - halfWidth && scaledX < centre + halfWidth;
                } :
                rect => {
                    return (scaledX >= rect.x && scaledX < rect.x2) || (scaledX >= rect.x2 && scaledX < rect.x);
                };

            const matchY = this.renderConfig.minRectHeight ? 
                rect => {
                    const halfHeight = Math.max(Math.abs((rect.y2 - rect.y)) / 2, halfMinHeight);
                    const centre = (rect.y + rect.y2) / 2;

                    return scaledY >= centre - halfHeight && scaledY < centre + halfHeight;
                } :
                rect => {
                    return (scaledY >= rect.y && scaledY < rect.y2) || (scaledY >= rect.y2 && scaledY < rect.y)
                };

            let lastMatch = null;
            for (let rect of rects) {
                if (matchX(rect) && matchY(rect)) {
                    lastMatch = rect;
                }
            }

            return lastMatch;
        }
    }

    /**
     * Finds a datum that overlaps the given value on domain.
     * The result is unspecified if multiple datums are found.
     * 
     * TODO: Rename the other findDatum to findSpec
     * 
     * @param {string} sampleId
     * @param {number} x position on the x domain
     */
    findDatumAt(sampleId, x) {
        const rects = this.specsBySample.get(sampleId);
        if (rects) {
            const rect = rects.find(rect => x >= rect.x && x < rect.x2);
            return rect && rect.rawDatum || undefined;
        }
    }

    getRangeAggregates() {
        // Aggregates can be used for sorting and filtering

        // TODO: Implement
        // Stuff that computes aggregates for a field of a (ordered) set of datums
        // Quantitative: Max, min, (weighted) mean, count, (total) difference between adjacent columns
        // Categorical: The most common category, other?
        return {
            quantitative: null,
            categorical: null
        };
    }

}

/**
 * 
 * @param {import("../gl/segmentsToVertices").RectSpec[]} rects 
 * @param {import("../utils/interval").default} interval
 */
function clipRects(rects, interval) {
    const lower = interval.lower, upper = interval.upper;
    const clipped = [];

    for (const rect of rects) {
        if (rect.x2 < lower || rect.x > upper) {
            // TODO: Use binary search for culling
            continue;

        } else if (rect.x >= lower && rect.x2 <= upper) {
            clipped.push(rect);

        } else {
            clipped.push(Object.assign(Object.create(rect),
                {
                    x: Math.max(rect.x, lower),
                    x2: Math.min(rect.x2, upper)
                }
            ));
        }
    }

    return clipped;
}
