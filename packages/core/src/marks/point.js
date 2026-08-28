import { quantileSorted } from "d3-array";
import Mark from "./mark.js";
import { getEncoderDataAccessor, isValueDef } from "../encoder/encoder.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { sampleIterable } from "../data/transforms/sample.js";
import { fixFill, fixStroke } from "./markUtils.js";

/** @extends {Mark<import("../spec/mark.js").PointProps>} */
export default class PointMark extends Mark {
    #semanticZoomFraction = () => 0;

    /** @param {import("../view/unitView.js").default} unitView */
    constructor(unitView) {
        super(unitView);
        const szf = this.properties.semanticZoomFraction;
        if (szf != null) {
            if (isExprRef(szf)) {
                const fn = this.unitView.paramRuntime.watchExpression(
                    szf.expr,
                    () => this.unitView.context.animator.requestRender()
                );
                this.#semanticZoomFraction = fn;
            } else {
                this.#semanticZoomFraction = () => szf;
            }
        }

        if ("geometricZoomBound" in this.properties) {
            console.warn(
                'geometricZoomBound is deprecated. Use something like the following instead: "size": { "expr": "min(0.5 * pow(zoomLevel, 2), 200)" }.'
            );
        }
    }

    /** @returns {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return [
            ...super.getSupportedChannels(),
            "size",
            "semanticScore",
            "shape",
            "strokeWidth",
            "dx",
            "dy",
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "angle",
        ];
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        const configured = this.unitView.getEncoding();
        const mark =
            typeof this.unitView.spec.mark == "object"
                ? this.unitView.spec.mark
                : {};
        const mayHaveLineShape =
            !isValueDef(encoding.shape) ||
            encoding.shape.value === "x" ||
            encoding.shape.value === "+";
        const configuredStrokeWidth = encoding.strokeWidth;

        for (const [legacy, offset] of /** @type {const} */ ([
            ["dx", "xOffset"],
            ["dy", "yOffset"],
        ])) {
            const legacyExplicit = configured[legacy] != null || legacy in mark;
            const offsetExplicit = configured[offset] != null || offset in mark;

            if (legacyExplicit && offsetExplicit) {
                throw new Error(
                    `Point marks cannot combine legacy ${legacy} with ${offset}. Use only ${offset}.`
                );
            }
        }

        fixStroke(encoding, this.properties.filled);
        fixFill(encoding, this.properties.filled);

        if (
            mayHaveLineShape &&
            isValueDef(encoding.stroke) &&
            encoding.stroke.value === null
        ) {
            encoding.strokeOpacity = { value: 0 };
            if (configuredStrokeWidth) {
                encoding.strokeWidth = configuredStrokeWidth;
            }
        }

        delete encoding.color;
        delete encoding.opacity;

        return encoding;
    }

    initializeData() {
        const semanticScoreAccessor = this.encoders.semanticScore
            ? getEncoderDataAccessor(
                  this.encoders.semanticScore
              )?.asNumberAccessor()
            : undefined;
        if (semanticScoreAccessor) {
            this.sampledSemanticScores = Float32Array.from(
                sampleIterable(
                    10000,
                    this.unitView.getCollector().getData(),
                    semanticScoreAccessor
                )
            );
            this.sampledSemanticScores.sort((a, b) => a - b);
        }
    }

    getSemanticThreshold() {
        if (!this.sampledSemanticScores) {
            return -1;
        } else if (this.sampledSemanticScores.length === 0) {
            return -1;
        }

        const p = Math.max(
            0,
            1 - this.#semanticZoomFraction() * this.unitView.getZoomLevel()
        );
        if (p <= 0) {
            return -Infinity;
        } else if (p >= 1) {
            return Infinity;
        } else {
            return quantileSorted(
                /** @type {number[]} */ (
                    /** @type {unknown} */ (this.sampledSemanticScores)
                ),
                p
            );
        }
    }
}
