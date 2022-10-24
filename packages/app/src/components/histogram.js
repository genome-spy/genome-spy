import { LitElement, html, nothing } from "lit";
import { bin } from "d3-array";
import { scaleLinear } from "d3-scale";
import clientPoint from "@genome-spy/core/utils/point";
import clamp from "@genome-spy/core/utils/clamp";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";

class Histogram extends LitElement {
    static properties = {
        values: { attribute: false },
        thresholds: { attribute: false },
        operators: { attribute: false },
        colors: { attribute: false },
        showThresholdNumbers: {},
    };

    #bin;

    #bins;

    #scale;

    // A hack to prevent click event when drag stops. A cleaner solution would be nice.
    #lastMouseUp = 0;

    constructor() {
        super();

        /** @type {number[]} */
        this.values = [];

        /** @type {number[]} */
        this.thresholds = [];

        /**
         * Each threshold should have a matching comparison operator.
         *
         * @type {("lt" | "lte" | "eq" | "gte" | "gt")[]}
         */
        this.operators = [];

        this.colors = defaultScheme;

        this.showThresholdNumbers = false;

        this.#bin = bin().thresholds(40);
        this.#bins = this.#bin([]);
        this.#scale = scaleLinear();
    }

    connectedCallback() {
        super.connectedCallback();
    }

    createRenderRoot() {
        return this;
    }

    /**
     *
     * @param {Map<string, any>} changedProperties
     */
    willUpdate(changedProperties) {
        if (changedProperties.has("values")) {
            this.#bins = this.#bin(this.values);
            this.#scale = scaleLinear().domain(this.domain).range([0, 100]);
        }
    }

    get domain() {
        return [this.#bins.at(0).x0, this.#bins.at(-1).x1];
    }

    /**
     * @param {MouseEvent} event
     */
    #clicked(event) {
        if (performance.now() < this.#lastMouseUp + 200) {
            return;
        }

        const elem = /** @type {HTMLElement} */ (event.target);
        const p = clientPoint(elem, event);

        this.#dispatch("add", 0, p[0] / elem.offsetWidth);
    }

    /**
     * @param {MouseEvent} event
     * @param {number} knobId
     */
    #knobMouseDown(event, knobId) {
        const knob = /** @type {HTMLElement} */ (event.target);
        const thresholdLine = /** @type {HTMLElement} */ (
            knob.closest(".histogram-threshold")
        );
        const knobPos = thresholdLine.offsetLeft;
        const containerWidth = /** @type {HTMLElement} */ (
            thresholdLine.offsetParent
        ).offsetWidth;

        event.preventDefault();
        event.stopPropagation();

        this.style.cursor = "col-resize";

        startDrag(
            event,
            (x, y) => {
                this.#dispatch(
                    "adjust",
                    knobId,
                    (knobPos + x) / containerWidth
                );
            },
            () => {
                this.#lastMouseUp = performance.now();
                this.style.cursor = "";
            }
        );
    }

    /**
     *
     * @param {"add" | "adjust"} type
     * @param {number} thresholdId
     * @param {number} value
     */
    #dispatch(type, thresholdId, value) {
        value = clamp(value, 0, 1);
        this.dispatchEvent(
            new ThresholdEvent(
                type,
                thresholdId,
                +this.#scale.invert(value * 100).toPrecision(3)
            )
        );
    }

    #computeBars() {
        const bins = this.#bins;
        const s = this.#scale;

        const hFactor =
            90 / bins.map((b) => b.length).reduce((a, b) => Math.max(a, b), 0);

        /** @type {{x: number, y: number, height: number, group: number}[]} */
        const bars = [];

        // Lazy implementation for eq. Only a single threshold is supported
        const eq = this.thresholds.length == 1 && this.operators[0] == "eq";

        const thresholdsWithEndpoints = [
            -Infinity,
            ...this.thresholds,
            Infinity,
        ];

        const operatorsWithEndpoints = [
            false, // False because it will be inverted
            ...this.operators.map((op) => ["lte", "gt"].includes(op)),
            true, // Both endpoins should be inclusive
        ];

        // Invert the order of groups for gt and gte.
        const fix = ["gt", "gte"].includes(this.operators[0])
            ? (/** @type {number} */ j) =>
                  thresholdsWithEndpoints.length - j - 2
            : (/** @type {number} */ j) => j;

        for (let i = 0; i < bins.length; i++) {
            const b = bins[i];
            const x = s(b.x0);
            let y = 0;
            let count = 0;
            if (eq) {
                for (let j = 0; j <= 1; j++) {
                    count = countMatches(b, this.thresholds[0], j);
                    if (count) {
                        bars.push({
                            x,
                            y: y * hFactor,
                            height: count * hFactor,
                            group: j,
                        });
                    }
                    y += count;
                }
            } else if (this.thresholds.length) {
                for (let j = 0; j < thresholdsWithEndpoints.length - 1; j++) {
                    const k = fix(j);
                    // TODO: Count exact matches when operator is "eq"
                    count = countWithin(
                        b,
                        thresholdsWithEndpoints[k],
                        thresholdsWithEndpoints[k + 1],
                        !operatorsWithEndpoints[k],
                        operatorsWithEndpoints[k + 1]
                    );
                    if (count) {
                        bars.push({
                            x,
                            y: y * hFactor,
                            height: count * hFactor,
                            group: j,
                        });
                    }
                    y += count;
                }
            } else {
                count = b.length;
                bars.push({ x, y, height: count * hFactor, group: null });
            }
        }

        return bars;
    }

    render() {
        const s = this.#scale;
        const w = 100 / this.#bins.length;

        const barDivs = this.#computeBars().map(
            (b) =>
                html`<div
                    style=${styleMap({
                        width: `${w + 0.01}%`,
                        left: `${b.x}%`,
                        bottom: `${b.y}%`,
                        height: `${b.height}%`,
                        backgroundColor:
                            typeof b.group == "number"
                                ? this.colors[b.group % this.colors.length]
                                : "default",
                    })}
                ></div>`
        );

        return html`<div class="histogram-widget">
            <div class="histogram-plot">
                <div class="histogram-bars">${barDivs}</div>
                <div class="histogram-thresholds" @click=${this.#clicked}>
                    ${this.thresholds.map((threshold, i) => {
                        const pos = s(threshold);
                        return pos >= 0 && pos <= 100
                            ? html`<div
                                  class="histogram-threshold"
                                  style="left: ${s(threshold)}%"
                              >
                                  <div
                                      class="histogram-knob"
                                      @mousedown=${(
                                          /** @type {MouseEvent}*/ event
                                      ) => this.#knobMouseDown(event, i)}
                                  >
                                      ${this.showThresholdNumbers
                                          ? i + 1
                                          : nothing}
                                  </div>
                              </div>`
                            : nothing;
                    })}
                </div>
                <div
                    class=${classMap({
                        "histogram-hint": true,
                        visible: !this.thresholds.length,
                    })}
                >
                    <span>Click here to add a threshold!</span>
                </div>
            </div>
            <div class="histogram-domain"></div>
            <div class="histogram-extent">
                ${s.domain().map((x) => html`<div>${x}</div>`)}
            </div>
        </div>`;
    }
}

customElements.define("genome-spy-histogram", Histogram);

export class ThresholdEvent extends Event {
    /**
     *
     * @param {"add" | "adjust"} type
     * @param {number} index
     * @param {number} value
     */
    constructor(type, index, value) {
        super(type);
        this.index = index;
        this.value = value;
    }
}

/**
 * @param {MouseEvent} event
 * @param {(x: number, y: number) => void} callback
 * @param {(x: number, y: number) => void} [endCallback]
 */
function startDrag(event, callback, endCallback) {
    const startX = event.clientX;
    const startY = event.clientY;

    /**
     * @param {MouseEvent} event
     */
    const mouseMoveHandler = function (event) {
        callback(event.clientX - startX, event.clientY - startY);
    };

    /**
     * @param {MouseEvent} event
     */
    const mouseUpHandler = function (event) {
        document.removeEventListener("mousemove", mouseMoveHandler);
        document.removeEventListener("mouseup", mouseUpHandler);

        endCallback?.(event.clientX - startX, event.clientY - startY);
    };

    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);
}

/**
 *
 * @param {number[]} values
 * @param {number} lo
 * @param {number} hi
 */
function countWithin(values, lo, hi, loInclusive = true, hiInclusive = false) {
    /** @type {(x: number) => boolean} */
    const testLo = loInclusive ? (x) => x >= lo : (x) => x > lo;

    /** @type {(x: number) => boolean} */
    const testHi = hiInclusive ? (x) => x <= hi : (x) => x < hi;

    let count = 0;
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (testLo(value) && testHi(value)) {
            count++;
        }
    }
    return count;
}

/**
 *
 * @param {any[]} values
 * @param {any} operand
 * @param {boolean} [negate]
 */
function countMatches(values, operand, negate = false) {
    let n = 0;
    for (let i = 0; i < values.length; i++) {
        n += +(values[i] == operand);
    }
    return negate ? values.length - n : n;
}

const defaultScheme = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
];
