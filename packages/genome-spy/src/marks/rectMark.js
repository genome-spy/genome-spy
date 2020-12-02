import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/rect.vertex.glsl";
import FRAGMENT_SHADER from "../gl/rect.fragment.glsl";
import { RectVertexBuilder } from "../gl/dataToVertices";
import createEncoders, { secondaryChannel } from "../encoder/encoder";

import Mark from "./mark";
import { fixPositional } from "./markUtils";

/** @type {import("../spec/view").EncodingConfigs} */
const defaultEncoding = {
    x: null,
    x2: null,
    y: null,
    y2: null,
    color: { value: "#4c78a8" }, // TODO: Configurable/theme
    opacity: { value: 1.0 },
    squeeze: { value: "none" } // choices: none, top, right, bottom, left
};

export const SQUEEZE = Object.fromEntries(
    ["none", "top", "right", "bottom", "left"].map((squeeze, i) => [squeeze, i])
);

export default class RectMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);
    }

    getAttributes() {
        return {
            x: { raw: true, complexGeometry: true },
            y: { raw: true, complexGeometry: true },
            color: {},
            opacity: { raw: true }
        };
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),
            minWidth: 0.5, // Minimum width/height prevents annoying flickering when zooming
            minHeight: 0.5,
            minOpacity: 0.0,

            tesselationZoomThreshold: 10, // This works with genomes, but likely breaks with other data. TODO: Fix, TODO: log2
            tesselationTiles: 35
        };
    }

    /**
     * @returns {import("../spec/view").EncodingConfigs}
     */
    getEncoding() {
        const encoding = super.getEncoding();

        // TODO: Ensure that both the primary and secondary channel are either variables or constants (values)

        fixPositional(encoding, "x");
        fixPositional(encoding, "y");

        return encoding;
    }

    onBeforeSampleAnimation() {
        const interval = this.getContext().genomeSpy.getViewportDomain();

        if (
            interval.width() <
            this.getContext()
                .genomeSpy.getDomain()
                .width() /
                this.properties.tesselationZoomThreshold
        ) {
            // TODO: Only bufferize the samples that are being animated
            this._sampleBufferInfo = this._createSampleBufferInfo(
                interval,
                interval.width() / this.properties.tesselationTiles
            );
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
        const numItems = [...this.dataByFacet.values()]
            .map(arr => arr.length)
            .reduce((a, c) => a + c, 0);

        // TODO: Disable tesselation on SimpleTrack - no need for it
        const builder = new RectVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            tesselationThreshold,
            visibleRange: interval ? interval.toArray() : undefined,
            numItems
        });

        for (const [sample, data] of this.dataByFacet.entries()) {
            builder.addBatch(sample, data);
        }
        const vertexData = builder.toArrays();

        return {
            rangeMap: vertexData.rangeMap,
            bufferInfo: twgl.createBufferInfoFromArrays(
                this.gl,
                vertexData.arrays,
                {
                    numElements: vertexData.vertexCount
                }
            )
        };
    }

    async initializeGraphics() {
        await super.initializeGraphics();

        this.createShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    updateGraphicsData() {
        this.deleteGraphicsData();

        const xDomain = undefined; //this.getXDomain();
        const domainWidth = xDomain ? xDomain.width() : Infinity;

        this._fullSampleBufferInfo = this._createSampleBufferInfo(
            null,
            domainWidth /
                this.properties.tesselationZoomThreshold /
                this.properties.tesselationTiles
        );
        this._sampleBufferInfo = this._fullSampleBufferInfo;

        this.bufferInfo = this._fullSampleBufferInfo.bufferInfo;
    }

    prepareRender() {
        super.prepareRender();

        const props = this.properties;

        twgl.setUniforms(this.programInfo, {
            uMinSize: [props.minWidth, props.minHeight], // in pixels
            uMinOpacity: props.minOpacity
        });

        twgl.setBuffersAndAttributes(
            this.gl,
            this.programInfo,
            this._sampleBufferInfo.bufferInfo
        );
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        // TODO: draw only the part that intersects with the viewport
        // Could use: http://lin-ear-th-inking.blogspot.com/2007/06/packed-1-dimensional-r-tree.html

        return this.createRenderCallback(
            range =>
                twgl.drawBufferInfo(
                    gl,
                    this.bufferInfo,
                    gl.TRIANGLE_STRIP,
                    range.count,
                    range.offset
                ),
            options,
            () => this._sampleBufferInfo.rangeMap
        );
    }

    /**
     * Finds a datum that overlaps the given value on the x domain.
     * The result is unspecified if multiple data are found.
     *
     * This is highly specific to SampleView and its sorting/filtering functionality.
     *
     * @param {string} facetId
     * @param {number} x position on the x domain
     * @returns {any}
     */
    findDatumAt(facetId, x) {
        const e = this.encoders;
        const data = this.dataByFacet.get(facetId);
        const a = e.x.accessor;
        const a2 = e.x2.accessor;
        if (data) {
            // TODO: Binary search
            return data.find(d => x >= a(d) && x < a2(d));
        }
    }
}
