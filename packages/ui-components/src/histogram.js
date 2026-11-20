import { LitElement, css, html, nothing } from "lit";
import { bin } from "d3-array";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";

const histogramStyles = css`
    :host {
        display: block;
        font-size: inherit;
        font-family: inherit;
    }

    .histogram-widget {
        position: relative;

        --grid-color: var(--gs-divider-color, #333);
        --background-color: var(--gs-histogram-background, #f0f0f0);
    }

    .histogram-plot {
        position: relative;
    }

    .histogram-bars {
        position: relative;
        height: 4em;
        background-color: var(--background-color);

        border-top-left-radius: 0.25em;
        border-top-right-radius: 0.25em;
        overflow: hidden;

        > div {
            position: absolute;
            background-color: var(--gs-theme-primary, #808080);
        }
    }

    .histogram-thresholds {
        position: absolute;
        height: 100%;
        width: 100%;
        top: 0;
    }

    .histogram-threshold {
        position: absolute;
        width: 1px;
        height: 100%;
        background-color: var(--gs-control-text, black);
    }

    .histogram-knob {
        --size: 1.2em;
        position: absolute;
        top: calc(var(--size) * -0.5);
        left: calc(0.5px - var(--size) * 0.5);
        width: var(--size);
        height: var(--size);
        border-radius: var(--size);

        background: var(--gs-control-text, black);
        color: var(--gs-control-background, white);

        font-size: 80%;
        text-align: center;
        vertical-align: middle;

        cursor: col-resize;
    }

    .histogram-domain {
        position: absolute;
        width: 100%;

        height: 0.5em;

        border: 1px solid var(--grid-color);
        border-bottom-style: none;
    }

    .histogram-extent {
        display: flex;
        justify-content: space-between;

        font-size: 90%;

        > div {
            margin: 0.1em 0.3em;
            margin-bottom: 0;
        }
    }

    .histogram-hint {
        position: absolute;
        inset: 0;
        font-size: 85%;

        display: flex;
        align-items: center;
        justify-content: center;

        pointer-events: none;

        opacity: 0;
        transition: opacity 0.3s;

        &.visible {
            opacity: 1;
        }

        span {
            position: relative;
            top: -30%;

            background-color: color-mix(
                in srgb,
                var(--background-color) 70%,
                transparent
            );
            color: var(--gs-muted-text, #333);
            cursor: default;
        }
    }
`;

/**
 * Show a numeric distribution with optional draggable thresholds. Handle
 * threshold events by assigning a new thresholds array.
 *
 * @tag gs-histogram
 * @fires {ThresholdEvent} add - A click suggests a threshold at `event.value`.
 * @fires {ThresholdEvent} adjust - A drag reports `event.index` and `event.value`.
 * @csspart plot - Plot surface containing the bars and thresholds.
 * @cssprop --gs-histogram-background - Plot surface.
 * @cssprop --gs-divider-color - Histogram grid lines.
 * @cssprop --gs-theme-primary - Fallback bar fill when colors is empty.
 * @cssprop --gs-control-text - Threshold lines and handles.
 */
export default class Histogram extends LitElement {
    static properties = {
        // Arrays are not reflected as attributes (use properties)
        values: { attribute: false },
        thresholds: { attribute: false },
        operators: { attribute: false },
        colors: { attribute: false },

        // Show threshold numbers inside knobs
        showThresholdNumbers: { type: Boolean },

        // Number of histogram bins (uses d3.bin thresholds)
        binCount: { type: Number, attribute: "bin-count" },
    };

    static styles = histogramStyles;

    #bin;

    #bins;

    // A hack to prevent click event when drag stops. A cleaner solution would be nice.
    #lastMouseUp = 0;

    constructor() {
        super();

        /** @type {number[]} Numeric observations to bin. */
        this.values = [];

        /** @type {number[]} Threshold values along the histogram's domain. */
        this.thresholds = [];

        /**
         * Each threshold should have a matching comparison operator.
         *
         * @type {("lt" | "lte" | "eq" | "gte" | "gt")[]}
         */
        this.operators = [];

        /** Palette for groups formed by the thresholds. */
        this.colors = defaultScheme;

        /** Display numeric values in the threshold handles. */
        this.showThresholdNumbers = false;

        /** Target bin count. Bin boundaries follow the numeric domain. */
        this.binCount = 40;
        this.#bin = bin().thresholds(this.binCount);
        this.#bins = this.#bin([]);
    }

    /**
     *
     * @param {Map<string, any>} changedProperties
     */
    willUpdate(changedProperties) {
        if (changedProperties.has("binCount")) {
            this.#bin = bin().thresholds(this.binCount);
        }

        if (
            changedProperties.has("values") ||
            changedProperties.has("binCount")
        ) {
            this.#bins = this.#bin(this.values);
        }
    }

    /** @type {number[]} Read-only lower and upper bounds of the binned range. */
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
        const x =
            event.clientX - elem.getBoundingClientRect().left - elem.clientLeft;

        this.#dispatch("add", 0, (x / elem.offsetWidth) * 100);
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
                    ((knobPos + x) / containerWidth) * 100
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
     * @param {number} percentage
     */
    #dispatch(type, thresholdId, percentage) {
        const fraction = Math.max(0, Math.min(100, percentage)) / 100;
        const [lower, upper] = this.domain;
        const value = lower * (1 - fraction) + upper * fraction;
        this.dispatchEvent(
            new ThresholdEvent(type, thresholdId, +value.toPrecision(3))
        );
    }

    /** @param {(value: number) => number} toPercent */
    #computeBars(toPercent) {
        const bins = this.#bins;

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
            const x = toPercent(b.x0);
            let y = 0;
            if (eq) {
                for (let j = 0; j <= 1; j++) {
                    const count = countMatches(b, this.thresholds[0], j > 0);
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
                    const count = countWithin(
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
                const count = b.length;
                if (count) {
                    bars.push({ x, y, height: count * hFactor, group: null });
                }
            }
        }

        return bars;
    }

    /** @returns {import("lit").HTMLTemplateResult} */
    render() {
        const domain = this.domain.map(Number);
        const [lower, upper] = domain;
        const span = upper - lower;

        /** @param {number} value */
        const toPercent = (value) => {
            if (value == null || Number.isNaN(Number(value))) {
                return NaN;
            }
            // A constant domain places every observation at the midpoint.
            return span === 0 ? 50 : ((value - lower) / span) * 100;
        };
        const w = 100 / this.#bins.length;

        const barDivs = this.#computeBars(toPercent).map(
            (b) =>
                html`<div
                    style=${styleMap({
                        width: w + 0.01 + "%",
                        left: b.x + "%",
                        bottom: b.y + "%",
                        height: b.height + "%",
                        backgroundColor:
                            typeof b.group == "number"
                                ? this.colors[b.group % this.colors.length]
                                : undefined,
                    })}
                ></div>`
        );

        return html`<div class="histogram-widget">
            <div class="histogram-plot" part="plot">
                <div class="histogram-bars">${barDivs}</div>
                <div class="histogram-thresholds" @click=${this.#clicked}>
                    ${this.thresholds.map((threshold, i) => {
                        const pos = toPercent(threshold);
                        return pos >= 0 && pos <= 100
                            ? html`<div
                                  class="histogram-threshold"
                                  style=${styleMap({
                                      left: pos + "%",
                                  })}
                              >
                                  <div
                                      class="histogram-knob"
                                      @mousedown=${(
                                          /** @type {MouseEvent}*/ event
                                      ) => this.#knobMouseDown(event, i)}
                                  >
                                      ${
                                          this.showThresholdNumbers
                                              ? i + 1
                                              : nothing
                                      }
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
                ${domain.map((x) => html`<div>${x}</div>`)}
            </div>
        </div>`;
    }
}

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
export function countWithin(
    values,
    lo,
    hi,
    loInclusive = true,
    hiInclusive = false
) {
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

export const defaultScheme = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
];
