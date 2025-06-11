import { drawBufferInfo, setBuffersAndAttributes } from "twgl.js";
import VERTEX_SHADER from "./rect.vertex.glsl";
import FRAGMENT_SHADER from "./rect.fragment.glsl";
import COMMON_SHADER from "./rect.common.glsl";
import { RectVertexBuilder } from "../gl/dataToVertices.js";

import Mark from "./mark.js";
import { fixFill, fixPositional, fixStroke } from "./markUtils.js";
import { asArray } from "../utils/arrayUtils.js";
import { isValueDef } from "../encoder/encoder.js";
import { getCachedOrCall } from "../utils/propertyCacher.js";
import { isDiscrete } from "vega-scale";
import { cssColorToArray } from "../gl/colorUtils.js";

const hatchPatterns = [
    "none",
    "diagonal",
    "antiDiagonal",
    "cross",
    "vertical",
    "horizontal",
    "grid",
    "dots",
    "rings",
    "ringsLarge",
];

/**
 * @extends {Mark<import("../spec/mark.js").RectProps>}
 */
export default class RectMark extends Mark {
    /**
     * @param {import("../view/unitView.js").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        this.augmentDefaultProperties({
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
        });
    }

    /**
     * @returns {import("../spec/channel.js").Channel[]}
     */
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
                    !this.#isRoundedCorners() &&
                    !this.#isStroked() &&
                    !this.properties.shadowOpacity &&
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

    #isRoundedCorners() {
        const p = this.properties;
        return (
            p.cornerRadius ||
            p.cornerRadiusBottomLeft ||
            p.cornerRadiusBottomRight ||
            p.cornerRadiusTopLeft ||
            p.cornerRadiusTopRight
        );
    }

    #isStroked() {
        const sw = this.encoding.strokeWidth;
        // True if there's any chance for a stroke to be drawn
        return !(isValueDef(sw) && !sw.value) || "condition" in sw;
    }

    async initializeGraphics() {
        await super.initializeGraphics();

        /** @type {string[]} */
        const defines = [];
        if (this.#isRoundedCorners()) {
            defines.push("ROUNDED_CORNERS");
        }
        if (this.#isStroked()) {
            defines.push("STROKED");
        }
        if (this.properties.shadowOpacity) {
            defines.push("SHADOW");
        }

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER, [
            COMMON_SHADER,
            ...defines.map((d) => "#define " + d),
        ]);
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();

        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;

        this.registerMarkUniformValue("uMinWidth", props.minWidth);
        this.registerMarkUniformValue("uMinHeight", props.minHeight);
        this.registerMarkUniformValue("uMinOpacity", props.minOpacity);
        this.registerMarkUniformValue(
            "uCornerRadiusTopRight",
            props.cornerRadiusTopRight ?? props.cornerRadius ?? 0
        );
        this.registerMarkUniformValue(
            "uCornerRadiusBottomRight",
            props.cornerRadiusBottomRight ?? props.cornerRadius ?? 0
        );
        this.registerMarkUniformValue(
            "uCornerRadiusTopLeft",
            props.cornerRadiusTopLeft ?? props.cornerRadius ?? 0
        );
        this.registerMarkUniformValue(
            "uCornerRadiusBottomLeft",
            props.cornerRadiusBottomLeft ?? props.cornerRadius ?? 0
        );

        this.registerMarkUniformValue("uHatchPattern", props.hatch, (x) =>
            Math.max(0, hatchPatterns.indexOf(x ?? "none"))
        );

        this.registerMarkUniformValue("uShadowBlur", props.shadowBlur ?? 0);
        this.registerMarkUniformValue(
            "uShadowOpacity",
            props.shadowOpacity ?? 0
        );
        this.registerMarkUniformValue(
            "uShadowOffsetX",
            props.shadowOffsetX ?? 0
        );
        this.registerMarkUniformValue(
            "uShadowOffsetY",
            props.shadowOffsetY ?? 0
        );
        this.registerMarkUniformValue(
            "uShadowColor",
            props.shadowColor ?? "black",
            cssColorToArray
        );
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        if (!collector) {
            console.debug("No collector");
            return;
        }
        const numItems = collector.getItemCount();

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

        ops.push(() => this.bindOrSetMarkUniformBlock());

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
            const a = e.x.dataAccessor;
            // TODO: Binary search
            return data.find((d) => x == a(d));
        } else {
            // TODO: Handle point features on locus/index scales
            const a = e.x.dataAccessor;
            const a2 = e.x2.dataAccessor;
            // TODO: Binary search
            return data.find((d) => x >= a(d) && x < a2(d));
        }
    }
}
