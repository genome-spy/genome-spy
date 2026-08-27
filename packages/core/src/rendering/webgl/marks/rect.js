import { drawBufferInfo, setBuffersAndAttributes } from "twgl.js";
import VERTEX_SHADER from "./rect.vertex.glsl";
import FRAGMENT_SHADER from "./rect.fragment.glsl";
import COMMON_SHADER from "./rect.common.glsl";
import { RectVertexBuilder } from "../gl/dataToVertices.js";

import WebGLMark from "./webGlMark.js";
import { isValueDef } from "../../../encoder/encoder.js";
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
 * @extends {WebGLMark}
 */
export default class WebGLRectMark extends WebGLMark {
    /**
     * @returns {import("../../../spec/channel.js").Channel[]}
     */
    getAttributes() {
        return [
            "uniqueId",
            "facetIndex",
            "x",
            "x2",
            "y",
            "y2",
            "xOffset",
            "yOffset",
            /** @type {import("../../../spec/channel.js").Channel} */ (
                "x2Offset"
            ),
            /** @type {import("../../../spec/channel.js").Channel} */ (
                "y2Offset"
            ),
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "strokeWidth",
        ];
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

    initializeGraphics() {
        super.initializeGraphics();

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
     * @param {import("../../../types/rendering.js").GlobalRenderingOptions} options
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
     * @param {import("../../../types/viewContext.js").MarkRenderingOptions} options
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
}
