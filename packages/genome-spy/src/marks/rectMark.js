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
import { asArray } from "../utils/arrayUtils";

export default class RectMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);
    }

    getAttributes() {
        return [
            "uniqueId",
            "facetIndex",
            "x",
            "x2",
            "y",
            "y2",
            "color",
            "opacity"
        ];
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
        // TODO: Tessellate rects inside the viewport
    }

    onAfterSampleAnimation() {
        // TODO: Pop the previous buffers
    }

    async initializeGraphics() {
        await super.initializeGraphics();

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        const numItems = collector.getItemCount();

        // TODO: Disable tessellation on SimpleTrack - no need for it
        const builder = new RectVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems,
            buildXIndex: this.properties.buildIndex
        });

        builder.addBatches(collector.facetBatches);

        const vertexData = builder.toArrays();
        this.rangeMap = vertexData.rangeMap;
        this.updateBufferInfo(vertexData);
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
            () => this.rangeMap
        );
    }

    /**
     * Finds a datum that overlaps the given value on the x domain.
     * The result is unspecified if multiple data are found.
     *
     * This is highly specific to SampleView and its sorting/filtering functionality.
     *
     * @param {any} facetId
     * @param {number} x position on the x domain
     * @returns {any}
     */
    findDatumAt(facetId, x) {
        facetId = asArray(facetId); // TODO: Do at the call site
        const e = this.encoders;
        const data = this.unitView.getCollector().facetBatches.get(facetId);
        const a = e.x.accessor;
        const a2 = e.x2.accessor;
        if (data) {
            // TODO: Binary search
            return data.find(d => x >= a(d) && x < a2(d));
        }
    }
}
