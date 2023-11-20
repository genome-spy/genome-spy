import { drawBufferInfo, setBuffersAndAttributes, setUniforms } from "twgl.js";
import VERTEX_SHADER from "../gl/rect.vertex.glsl";
import FRAGMENT_SHADER from "../gl/rect.fragment.glsl";
import { RectVertexBuilder } from "../gl/dataToVertices.js";

import Mark from "./mark.js";
import { fixFill, fixPositional, fixStroke } from "./markUtils.js";
import { asArray } from "../utils/arrayUtils.js";
import { isValueDef } from "../encoder/encoder.js";
import { getCachedOrCall } from "../utils/propertyCacher.js";
import { isDiscrete } from "vega-scale";

export default class RectMark extends Mark {
    /**
     * @param {import("../view/unitView.js").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        Object.defineProperties(
            this.defaultProperties,
            Object.getOwnPropertyDescriptors({
                x2: undefined,
                y2: undefined,
                filled: true,
                color: "#4c78a8",
                opacity: 1.0,
                strokeWidth: 3,
                cornerRadius: 0.0,

                minWidth: 0.5, // Minimum width/height prevents annoying flickering when zooming
                minHeight: 0.5,
                minOpacity: 1.0,

                tessellationZoomThreshold: 10, // This works with genomes, but likely breaks with other data. TODO: Fix, TODO: log2
                tessellationTiles: 35, // TODO: Tiles per unit (bp)
            })
        );
    }

    getAttributes() {
        return [
            "uniqueId",
            "facetIndex",
            "x",
            "x2",
            "y",
            "y2",
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "strokeWidth",
        ];
    }

    /**
     * @returns {import("../spec/channel.js").Channel[]}
     */
    getSupportedChannels() {
        return [
            ...super.getSupportedChannels(),
            "x2",
            "y2",
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "strokeWidth",
        ];
    }

    get opaque() {
        return (
            getCachedOrCall(
                this,
                "opaque",
                () =>
                    !this._isRoundedCorners() &&
                    !this._isStroked() &&
                    isValueDef(this.encoding.fillOpacity) &&
                    this.encoding.fillOpacity.value == 1.0 &&
                    this.properties.minOpacity == 1.0
            ) && this.unitView.getEffectiveOpacity() == 1
        );
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        // TODO: Ensure that both the primary and secondary channel are either variables or constants (values)
        fixPositional(encoding, "x");
        fixPositional(encoding, "y");

        fixStroke(encoding, this.properties.filled);
        fixFill(encoding, this.properties.filled);

        // TODO: Function for getting rid of extras. Also should validate that all attributes are defined
        delete encoding.color;
        delete encoding.opacity;

        return encoding;
    }

    onBeforeSampleAnimation() {
        // TODO: Tessellate rects inside the viewport
    }

    onAfterSampleAnimation() {
        // TODO: Pop the previous buffers
    }

    _isRoundedCorners() {
        const p = this.properties;
        return (
            p.cornerRadius ||
            p.cornerRadiusBottomLeft ||
            p.cornerRadiusBottomRight ||
            p.cornerRadiusTopLeft ||
            p.cornerRadiusTopRight
        );
    }

    _isStroked() {
        const sw = this.encoding.strokeWidth;
        return !(isValueDef(sw) && !sw.value);
    }

    async initializeGraphics() {
        await super.initializeGraphics();

        /** @type {string[]} */
        const defines = [];
        if (this._isRoundedCorners()) {
            defines.push("ROUNDED_CORNERS");
        }
        if (this._isStroked()) {
            defines.push("STROKED");
        }

        this.createAndLinkShaders(
            VERTEX_SHADER,
            FRAGMENT_SHADER,
            defines.map((d) => "#define " + d)
        );
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();

        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;

        setUniforms(this.programInfo, {
            uMinSize: [props.minWidth, props.minHeight], // in pixels
            uMinOpacity: props.minOpacity,
            uCornerRadii: [
                props.cornerRadiusTopRight ?? props.cornerRadius,
                props.cornerRadiusBottomRight ?? props.cornerRadius,
                props.cornerRadiusTopLeft ?? props.cornerRadius,
                props.cornerRadiusBottomLeft ?? props.cornerRadius,
            ],
        });
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        const numItems = collector.getItemCount();

        // TODO: Disable tessellation on SimpleTrack - no need for it
        const builder = new RectVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems,
        });

        builder.addBatches(collector.facetBatches);

        const vertexData = builder.toArrays();
        this.rangeMap.migrateEntries(vertexData.rangeMap);
        this.updateBufferInfo(vertexData);
    }

    /**
     * @param {import("../types/rendering.js").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        const ops = super.prepareRender(options);

        ops.push(() =>
            setBuffersAndAttributes(
                this.gl,
                this.programInfo,
                this.vertexArrayInfo
            )
        );

        return ops;
    }

    /**
     * @param {import("./mark.js").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback((offset, count) => {
            drawBufferInfo(
                gl,
                this.vertexArrayInfo,
                gl.TRIANGLE_STRIP,
                count,
                offset
            );
        }, options);
    }

    /**
     * Finds a datum that overlaps the given value on the x domain.
     * The result is unspecified if multiple data are found.
     *
     * This is highly specific to SampleView and its sorting/filtering functionality.
     *
     * @param {any} facetId
     * @param {import("../spec/channel.js").Scalar} x value on the x domain
     * @returns {any}
     * @override
     */
    findDatumAt(facetId, x) {
        facetId = asArray(facetId); // TODO: Do at the call site
        const data = this.unitView.getCollector().facetBatches.get(facetId);
        if (!data) {
            return;
        }

        const e = this.encoders;

        const scaleType = e.x.scale.type;

        if (isDiscrete(scaleType)) {
            const a = e.x.accessor;
            // TODO: Binary search
            return data.find((d) => x == a(d));
        } else {
            // TODO: Handle point features on locus/index scales
            const a = e.x.accessor;
            const a2 = e.x2.accessor;
            // TODO: Binary search
            return data.find((d) => x >= a(d) && x < a2(d));
        }
    }
}
