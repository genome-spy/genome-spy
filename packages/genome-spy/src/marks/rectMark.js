import {
    createBufferInfoFromArrays,
    drawBufferInfo,
    setBuffersAndAttributes,
    setUniforms
} from "twgl.js";
import VERTEX_SHADER from "../gl/rect.vertex.glsl";
import FRAGMENT_SHADER from "../gl/rect.fragment.glsl";
import { RectVertexBuilder } from "../gl/dataToVertices";

import Mark from "./mark";
import { fixPositional } from "./markUtils";

export default class RectMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);
    }

    getAttributes() {
        return ["facetIndex", "x", "x2", "y", "y2", "color", "opacity"];
    }

    getSupportedChannels() {
        return [...super.getSupportedChannels(), "x2", "y2"];
    }

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),

            x2: undefined,
            y2: undefined,
            color: "#4c78a8",
            opacity: 1.0,

            minWidth: 0.5, // Minimum width/height prevents annoying flickering when zooming
            minHeight: 0.5,
            minOpacity: 0.0,

            tessellationZoomThreshold: 10, // This works with genomes, but likely breaks with other data. TODO: Fix, TODO: log2
            tessellationTiles: 35 // TODO: Tiles per unit (bp)
        };
    }

    /**
     * @param {import("../spec/channel").Encoding} encoding
     * @returns {import("../spec/channel").Encoding}
     */
    fixEncoding(encoding) {
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
                this.properties.tessellationZoomThreshold
        ) {
            // TODO: Only bufferize the samples that are being animated
            this._sampleBufferInfo = this._createSampleBufferInfo(
                interval,
                interval.width() / this.properties.tessellationTiles
            );
        }
    }

    onAfterSampleAnimation() {
        this._sampleBufferInfo = this._fullSampleBufferInfo;
    }

    /**
     *
     * @param {number[]} [interval]
     * @param {number} [tessellationThreshold]
     */
    _createSampleBufferInfo(interval, tessellationThreshold) {
        const collector = this.unitView.getCollector();
        const data = collector.getData();
        const numItems = data.length;

        // TODO: Disable tessellation on SimpleTrack - no need for it
        const builder = new RectVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            tessellationThreshold,
            visibleRange: interval,
            numItems,
            buildXIndex: this.properties.buildIndex
        });

        if (this.unitView.getFacetFields()) {
            for (const [facetKey, extent] of collector.groupExtentMap) {
                builder.addBatch(facetKey, data, ...extent);
            }
        } else {
            builder.addBatch(undefined, data);
        }

        const vertexData = builder.toArrays();

        // Ensure that no VAOs are inadvertently altered
        this.gl.bindVertexArray(null);

        // TODO: Should mark.updateBufferInfo() be used instead?

        return {
            rangeMap: vertexData.rangeMap,
            bufferInfo: createBufferInfoFromArrays(this.gl, vertexData.arrays, {
                numElements: vertexData.vertexCount
            })
        };
    }

    async initializeGraphics() {
        await super.initializeGraphics();

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    updateGraphicsData() {
        this.deleteGraphicsData();

        const xDomain = undefined; //this.getXDomain();
        const domainWidth = xDomain ? xDomain.width() : Infinity;

        this._fullSampleBufferInfo = this._createSampleBufferInfo(
            undefined,
            domainWidth /
                this.properties.tessellationZoomThreshold /
                this.properties.tessellationTiles
        );
        this._sampleBufferInfo = this._fullSampleBufferInfo;

        this.bufferInfo = this._fullSampleBufferInfo.bufferInfo;
    }

    prepareRender() {
        super.prepareRender();

        const props = this.properties;

        setUniforms(this.programInfo, {
            uMinSize: [props.minWidth, props.minHeight], // in pixels
            uMinOpacity: props.minOpacity
        });

        setBuffersAndAttributes(
            this.gl,
            this.programInfo,
            this.vertexArrayInfo
        );
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback(
            (offset, count) => {
                drawBufferInfo(
                    gl,
                    this.vertexArrayInfo,
                    gl.TRIANGLE_STRIP,
                    count,
                    offset
                );
            },
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
        throw new Error("Broken!");
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
