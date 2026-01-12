import { html, css } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import BaseDialog from "../components/generic/baseDialog.js";
import "../components/generic/customSelect.js";
import { showMessageDialog } from "../components/generic/messageDialog.js";
import { SCHEME_NAMES, schemeToDataUrl } from "../utils/ui/schemeToDataUrl.js";

export const DEFAULT_COLOR = "#808080";

/**
 * @typedef {"nominal" | "ordinal" | "quantitative"} DataType
 * @typedef {"linear" | "log" | "pow" | "sqrt" | "symlog" | "threshold"} QuantScaleType
 * @typedef {"scheme" | "manual"} ColorMode
 *
 * @typedef {object} DomainRangePair
 * @prop {string} domain
 * @prop {string} range
 */

/**
 * @typedef {object} ScaleDialogState
 * @prop {DataType} dataType
 * @prop {ColorMode} colorMode
 * @prop {"observed" | "explicit"} domainMode
 * @prop {QuantScaleType} scaleType
 * @prop {string} scheme
 * @prop {number[]} quantDomain
 * @prop {string[]} quantRange
 * @prop {number | null} domainMid
 * @prop {DomainRangePair[]} domainPairs
 * @prop {number[]} thresholds
 * @prop {string[]} thresholdRange
 */

/**
 * @param {number | null} domainMid
 * @returns {number}
 */
export function getExpectedQuantRangeLength(domainMid) {
    return domainMid != null ? 3 : 2;
}

/**
 * @param {DataType} dataType
 * @returns {boolean}
 */
export function isDiscreteDataType(dataType) {
    return dataType === "nominal" || dataType === "ordinal";
}

/**
 * @param {import("@genome-spy/core/spec/scale.js").Scale | null | undefined} scale
 * @param {DataType} dataType
 * @param {(string | number)[]} observedDomain
 * @param {{ scheme: string, scaleType: QuantScaleType }} defaults
 * @returns {ScaleDialogState}
 */
export function parseScaleSpec(scale, dataType, observedDomain, defaults) {
    const isDiscrete = isDiscreteDataType(dataType);

    /** @type {ScaleDialogState} */
    const state = {
        dataType,
        colorMode: "scheme",
        domainMode: "observed",
        scaleType: defaults.scaleType,
        scheme: defaults.scheme,
        quantDomain: [],
        quantRange: [],
        domainMid: null,
        domainPairs: [],
        thresholds: [],
        thresholdRange: [],
    };

    if (!scale) {
        if (isDiscrete && observedDomain.length > 0) {
            state.domainPairs = observedDomain.map((value) => ({
                domain: String(value),
                range: DEFAULT_COLOR,
            }));
        } else if (!isDiscrete && observedDomain.length === 2) {
            state.quantDomain = /** @type {number[]} */ (observedDomain);
        }
        return state;
    }

    if (!isDiscrete && scale.type) {
        state.scaleType = /** @type {QuantScaleType} */ (scale.type);
    }

    if (scale.scheme) {
        state.scheme = /** @type {string} */ (scale.scheme);
    }

    if (scale.domainMid != null) {
        state.domainMid = scale.domainMid;
    }

    if (scale.range) {
        state.colorMode = "manual";
    }

    if (scale.domain) {
        state.domainMode = "explicit";
    }

    if (!isDiscrete && scale.type === "threshold") {
        state.colorMode = "manual";
        state.domainMode = "explicit";
        state.thresholds = /** @type {number[]} */ (scale.domain ?? []);
        state.thresholdRange = /** @type {string[]} */ (scale.range ?? []);
        return state;
    }

    if (isDiscrete) {
        const domainValues = scale.domain?.map((value) => String(value)) ?? [];
        if (state.colorMode === "manual") {
            // TODO: Handle pre-defined range values. Now this will fail for that case.
            const rangeValues = /** @type {string[]} */ (scale.range ?? []);
            state.domainPairs =
                domainValues.length > 0
                    ? domainValues.map((domain, index) => ({
                          domain,
                          range: rangeValues[index] ?? DEFAULT_COLOR,
                      }))
                    : rangeValues.map((range) => ({
                          domain: "",
                          range,
                      }));
        } else {
            state.domainPairs = domainValues.map((domain) => ({
                domain,
                range: DEFAULT_COLOR,
            }));
        }
        return state;
    }

    if (scale.domain) {
        state.quantDomain = /** @type {number[]} */ (scale.domain);
    } else if (observedDomain.length === 2) {
        state.quantDomain = /** @type {number[]} */ (observedDomain);
    }

    if (scale.range) {
        state.quantRange = /** @type {string[]} */ (scale.range);
    }

    return state;
}

/**
 * @param {number[]} quantDomain
 * @param {string[]} quantRange
 * @param {(string | number)[]} observedDomain
 * @param {number | null} domainMid
 * @returns {{ quantDomain: number[], quantRange: string[] }}
 */
export function normalizeQuantDomainRange(
    quantDomain,
    quantRange,
    observedDomain,
    domainMid
) {
    const hasObserved = observedDomain.length === 2;
    const defaultMin = hasObserved ? Number(observedDomain[0]) : 0;
    const defaultMax = hasObserved ? Number(observedDomain[1]) : 1;

    const domain = [...quantDomain];
    if (domain.length === 0) {
        domain.push(defaultMin, defaultMax);
    } else if (domain.length === 1) {
        domain.push(defaultMax);
    }

    const min = domain[0] ?? defaultMin;
    const max = domain[domain.length - 1] ?? defaultMax;
    const normalizedDomain = [min, max];

    const desiredRangeLength = getExpectedQuantRangeLength(domainMid);
    let range = [...quantRange];
    if (range.length < desiredRangeLength) {
        const last = range[range.length - 1] ?? DEFAULT_COLOR;
        while (range.length < desiredRangeLength) {
            range.push(last);
        }
    } else if (range.length > desiredRangeLength) {
        range = range.slice(0, desiredRangeLength);
    }

    return {
        quantDomain: normalizedDomain,
        quantRange: range,
    };
}

/**
 * @param {number[]} thresholds
 * @param {string[]} thresholdRange
 * @returns {{ thresholds: number[], thresholdRange: string[] }}
 */
export function normalizeThresholdRange(thresholds, thresholdRange) {
    const desiredRangeLength = Math.max(0, thresholds.length + 1);
    let range = [...thresholdRange];
    if (range.length < desiredRangeLength) {
        const last = range[range.length - 1] ?? DEFAULT_COLOR;
        while (range.length < desiredRangeLength) {
            range.push(last);
        }
    } else if (range.length > desiredRangeLength) {
        range = range.slice(0, desiredRangeLength);
    }

    return {
        thresholds: [...thresholds],
        thresholdRange: range,
    };
}

/**
 * @param {ScaleDialogState} state
 * @returns {string | null}
 */
export function validateScaleState(state) {
    if (state.dataType === "quantitative") {
        if (state.scaleType === "threshold") {
            if (state.colorMode !== "manual") {
                return "Threshold scales require manual colors.";
            }
            if (state.domainMode !== "explicit") {
                return "Threshold scales require an explicit domain.";
            }
            if (state.thresholds.length === 0) {
                return "Add at least one threshold.";
            }
            if (state.thresholdRange.length !== state.thresholds.length + 1) {
                return "Threshold scales require one more color than thresholds.";
            }
            return null;
        }

        if (state.domainMode === "explicit" && state.quantDomain.length !== 2) {
            return "Explicit quantitative domains require min and max values.";
        }

        if (state.colorMode === "manual") {
            const expectedRangeLength = getExpectedQuantRangeLength(
                state.domainMid
            );
            if (state.quantRange.length !== expectedRangeLength) {
                return "Manual quantitative ranges must match the domain stops.";
            }
        }

        return null;
    }

    if (state.colorMode === "manual" && state.domainMode !== "explicit") {
        return "Manual colors require an explicit domain.";
    }

    if (state.domainMode === "explicit") {
        if (state.domainPairs.length === 0) {
            return "Add at least one domain value.";
        }
        if (state.domainPairs.some((pair) => pair.domain.trim() === "")) {
            return "All domain values must be filled.";
        }
    }

    return null;
}

/**
 * @param {ScaleDialogState} state
 * @returns {import("@genome-spy/core/spec/scale.js").Scale | null}
 */
export function buildQuantitativeScaleSpec(state) {
    /** @type {import("@genome-spy/core/spec/scale.js").Scale} */
    const scale = {
        type: state.scaleType,
    };

    if (state.scaleType === "threshold") {
        if (state.colorMode !== "manual" || state.domainMode !== "explicit") {
            return null;
        }
        if (state.thresholds.length === 0) {
            return null;
        }
        if (state.thresholdRange.length !== state.thresholds.length + 1) {
            return null;
        }
        scale.domain = state.thresholds;
        scale.range = state.thresholdRange;
        return scale;
    }

    if (state.domainMid != null) {
        scale.domainMid = state.domainMid;
    }

    if (state.colorMode === "scheme") {
        scale.scheme = state.scheme;
        if (state.domainMode === "explicit") {
            scale.domain = state.quantDomain;
        }
        return scale;
    }

    const expectedRangeLength = getExpectedQuantRangeLength(state.domainMid);
    if (state.quantRange.length !== expectedRangeLength) {
        return null;
    }
    if (state.domainMode === "explicit") {
        if (state.quantDomain.length !== 2) {
            return null;
        }
        scale.domain = state.quantDomain;
    }
    scale.range = state.quantRange;
    return scale;
}

/**
 * @param {ScaleDialogState} state
 * @returns {import("@genome-spy/core/spec/scale.js").Scale | null}
 */
export function buildDiscreteScaleSpec(state) {
    /** @type {import("@genome-spy/core/spec/scale.js").Scale} */
    const scale = {
        type: "ordinal",
    };

    if (state.colorMode === "scheme") {
        scale.scheme = state.scheme;
        if (state.domainMode === "explicit") {
            scale.domain = state.domainPairs.map((pair) => pair.domain);
        }
        return scale;
    }

    if (state.domainMode !== "explicit") {
        return null;
    }
    scale.domain = state.domainPairs.map((pair) => pair.domain);
    scale.range = state.domainPairs.map((pair) => pair.range);
    return scale;
}

/**
 * A dialog for interactively configuring Vega-Lite scale specifications.
 *
 * Provides a form-based interface for users to customize scale properties such as:
 * - Scale type (linear, log, pow, sqrt, symlog for quantitative; ordinal for discrete)
 * - Color mapping mode (scheme-based or manual domain→range pairs)
 * - Domain (observed or explicit user-defined values)
 * - Color schemes (via Vega color schemes, or custom manual colors)
 * - Domain mid-point (for diverging scales)
 *
 * The dialog builds and returns a Vega-Lite scale specification that can be
 * applied to visualization channels (color, size, opacity, etc.).
 *
 * Usage:
 * - Set properties such as `dataType`, `observedDomain`, etc. before opening
 * - Call `show()` or append to DOM to open dialog
 * - Dialog emits "finish" event with `{ok: true, data: scaleSpec}` on confirm
 * - Or "finish" event with `{ok: false}` on cancel
 *
 * @extends BaseDialog
 */
export default class ConfigureScaleDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        dataType: { type: String },
        observedDomain: { type: Array },
        scale: { type: Object },
        colorMode: { type: String, state: true },
        domainMode: { type: String, state: true },
        scheme: { type: String, state: true },
        scaleType: { type: String, state: true },
        domainPairs: { type: Array, state: true },
        quantDomain: { type: Array, state: true },
        quantRange: { type: Array, state: true },
        domainMid: { type: Number, state: true },
        thresholds: { type: Array, state: true },
        thresholdRange: { type: Array, state: true },
    };

    constructor() {
        super();

        /** @type {DataType} */
        this.dataType = "quantitative";
        /** @type {(string | number)[]} */
        this.observedDomain = [];
        /** @type {import("@genome-spy/core/spec/scale.js").Scale | null} */
        this.scale = null;
        this.dialogTitle = "Configure Scale";

        /** @type {ColorMode} */
        this.colorMode = "scheme";
        /** @type {"observed" | "explicit"} */
        this.domainMode = "observed";
        this.scheme = "viridis";
        /** @type {QuantScaleType} */
        this.scaleType = "linear";
        /** @type {DomainRangePair[]} */
        this.domainPairs = [];
        /** @type {number[]} */
        this.quantDomain = [];
        /** @type {string[]} */
        this.quantRange = [];
        /** @type {number | null} */
        this.domainMid = null;
        /** @type {number[]} */
        this.thresholds = [];
        /** @type {string[]} */
        this.thresholdRange = [];
    }

    connectedCallback() {
        super.connectedCallback();
        this.#initializeFromProps();
    }

    #initializeFromProps() {
        const parsed = parseScaleSpec(
            this.scale,
            this.dataType,
            this.observedDomain,
            { scheme: this.scheme, scaleType: this.scaleType }
        );

        this.colorMode = parsed.colorMode;
        this.domainMode = parsed.domainMode;
        this.scheme = parsed.scheme;
        this.scaleType = parsed.scaleType;
        this.quantDomain = parsed.quantDomain;
        this.quantRange = parsed.quantRange;
        this.domainMid = parsed.domainMid;
        this.domainPairs = parsed.domainPairs;
        this.thresholds = parsed.thresholds;
        this.thresholdRange = parsed.thresholdRange;
        if (this.scaleType === "threshold") {
            this.#ensureThresholdRangeLengths();
        }
    }

    static styles = [
        ...super.styles,
        css`
            .gs-form-section {
                margin-bottom: var(--gs-basic-spacing, 10px);
            }

            .gs-form-section-title {
                font-weight: bold;
                margin-bottom: 0.5em;
            }

            .radio-group {
                display: flex;
                flex-direction: column;
            }

            .radio-group label {
                display: flex;
                align-items: center;
                gap: 0.3em;
            }

            .domain-range-list {
                display: flex;
                flex-direction: column;
                gap: 0.5em;
            }

            .domain-range-row {
                display: flex;
                align-items: center;
                gap: 0.5em;
            }

            .domain-range-row input[type="text"] {
                flex: 1;
            }

            .domain-range-row input[type="color"] {
                width: 50px;
                height: 30px;
            }

            .range-color-pickers {
                display: flex;
                gap: 0.75em;
                flex-wrap: wrap;
                align-items: center;
            }

            .range-color-btn {
                display: inline-flex;
                flex-direction: row;
                align-items: center;
                gap: 0.35em;
                padding: 0.35em 0.9em;
                border-radius: var(--form-control-border-radius);
                background: #f0f0f0;
                white-space: nowrap;
            }

            .range-color-label {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0.15em;
            }

            .range-color-label code {
                font-size: 0.8em;
                color: var(--text-muted, #666);
            }

            .icon-btn {
                background: none;
                border: 1px solid var(--form-control-border-color);
                border-radius: var(--form-control-border-radius);
                padding: 0.3em 0.5em;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            .icon-btn:hover {
                background-color: var(--button-hover-bg, #f0f0f0);
            }

            .icon-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .domain-inputs {
                display: flex;
                gap: 0.5em;
                align-items: center;
            }

            .domain-inputs input {
                width: 100px;
            }

            .error-msg {
                color: var(--danger-color, #dc3545);
                font-size: 0.85em;
                margin-top: 0.25em;
            }

            .form-input {
                display: block;
                width: 100%;
            }
        `,
    ];

    #addDomainPair() {
        this.domainPairs = [
            ...this.domainPairs,
            { domain: "", range: DEFAULT_COLOR },
        ];
    }

    /**
     * @param {number} index
     */
    #removeDomainPair(index) {
        this.domainPairs = this.domainPairs.filter((_, i) => i !== index);
    }

    /**
     * @param {number} index
     * @param {"domain" | "range"} field
     * @param {string} value
     */
    #updateDomainPair(index, field, value) {
        this.domainPairs = this.domainPairs.map((pair, i) =>
            i === index ? { ...pair, [field]: value } : pair
        );
    }

    /**
     * @param {number} index
     * @param {string} value
     */
    #updateQuantRange(index, value) {
        this.quantRange = this.quantRange.map((v, i) =>
            i === index ? value : v
        );
    }

    /**
     * @param {number} index
     * @param {number} value
     */
    #updateThreshold(index, value) {
        this.thresholds = this.thresholds.map((v, i) =>
            i === index ? value : v
        );
    }

    /**
     * @param {number} index
     * @param {string} value
     */
    #updateThresholdRange(index, value) {
        this.thresholdRange = this.thresholdRange.map((v, i) =>
            i === index ? value : v
        );
    }

    #addThreshold() {
        const last = this.thresholds[this.thresholds.length - 1] ?? 0;
        this.thresholds = [...this.thresholds, last];
        this.#ensureThresholdRangeLengths();
    }

    /**
     * @param {number} index
     */
    #removeThreshold(index) {
        this.thresholds = this.thresholds.filter((_, i) => i !== index);
        this.#ensureThresholdRangeLengths();
    }

    #ensureQuantDomainRangeLengths() {
        const normalized = normalizeQuantDomainRange(
            this.quantDomain,
            this.quantRange,
            this.observedDomain,
            this.domainMid
        );

        if (
            this.quantDomain.length !== normalized.quantDomain.length ||
            normalized.quantDomain.some((v, i) => v !== this.quantDomain[i])
        ) {
            this.quantDomain = normalized.quantDomain;
        }

        if (
            this.quantRange.length !== normalized.quantRange.length ||
            normalized.quantRange.some((v, i) => v !== this.quantRange[i])
        ) {
            this.quantRange = normalized.quantRange;
        }
    }

    #ensureThresholdRangeLengths() {
        const normalized = normalizeThresholdRange(
            this.thresholds,
            this.thresholdRange
        );

        if (
            this.thresholds.length !== normalized.thresholds.length ||
            normalized.thresholds.some((v, i) => v !== this.thresholds[i])
        ) {
            this.thresholds = normalized.thresholds;
        }

        if (
            this.thresholdRange.length !== normalized.thresholdRange.length ||
            normalized.thresholdRange.some(
                (v, i) => v !== this.thresholdRange[i]
            )
        ) {
            this.thresholdRange = normalized.thresholdRange;
        }
    }

    async #validateAndSubmit() {
        const error = validateScaleState(this.#buildState());
        if (error) {
            await showMessageDialog(error, {
                title: "Warning",
                type: "warning",
            });
            return;
        }

        const scale = this.#buildScale();
        if (scale) {
            this.finish({ ok: true, data: scale });
            this.triggerClose();
        } else {
            await showMessageDialog(
                "Unable to build scale from the current settings.",
                { title: "Warning", type: "warning" }
            );
        }
    }

    /**
     * @returns {import("@genome-spy/core/spec/scale.js").Scale | null}
     */
    #buildScale() {
        if (this.dataType === "quantitative") {
            return this.#buildQuantitativeScale();
        }
        return this.#buildDiscreteScale();
    }

    /**
     * @returns {ScaleDialogState}
     */
    #buildState() {
        return {
            dataType: this.dataType,
            colorMode: this.colorMode,
            domainMode: this.domainMode,
            scaleType: this.scaleType,
            scheme: this.scheme,
            quantDomain: this.quantDomain,
            quantRange: this.quantRange,
            domainMid: this.domainMid,
            domainPairs: this.domainPairs,
            thresholds: this.thresholds,
            thresholdRange: this.thresholdRange,
        };
    }

    /**
     * @returns {import("@genome-spy/core/spec/scale.js").Scale | null}
     */
    #buildQuantitativeScale() {
        return buildQuantitativeScaleSpec(this.#buildState());
    }

    /**
     * @returns {import("@genome-spy/core/spec/scale.js").Scale | null}
     */
    #buildDiscreteScale() {
        return buildDiscreteScaleSpec(this.#buildState());
    }

    // Data type selection is managed externally; do not render radio buttons here.

    #renderColorModeSelector() {
        if (this.scaleType === "threshold") {
            return html``;
        }
        return html`
            <div class="gs-form-group">
                <label for="schemeColorModeRadio">Color Mapping</label>
                <div class="radio-group">
                    ${this.#renderColorModeRadio(
                        "scheme",
                        "Use Color Scheme",
                        "schemeColorModeRadio"
                    )}
                    ${this.#renderColorModeRadio(
                        "manual",
                        "Manual Colors",
                        "manualColorModeRadio"
                    )}
                </div>
            </div>
        `;
    }

    /**
     * @param {ColorMode} mode
     * @param {string} label
     * @param {string} id
     */
    #renderColorModeRadio(mode, label, id) {
        return html`
            <label>
                <input
                    type="radio"
                    id=${id}
                    name="colorMode"
                    value=${mode}
                    ?checked=${this.colorMode === mode}
                    @change=${() => (this.colorMode = mode)}
                />
                ${label}
            </label>
        `;
    }

    #renderSchemeSelector() {
        return html`
            <div class="gs-form-group">
                <label>Color Scheme</label>
                <gs-custom-select
                    class="form-input"
                    .options=${SCHEME_NAMES}
                    .value=${this.scheme}
                    .getLabel=${(/** @type {string} */ name) =>
                        html`<img src=${schemeToDataUrl(name)} />
                            <span>${name}</span>`}
                    @change=${(/** @type {CustomEvent} */ e) => {
                        this.scheme = /** @type {any} */ (e.target).value;
                    }}
                >
                </gs-custom-select>
            </div>
        `;
    }

    #onObservedDomainSelected() {
        this.domainMode = "observed";
        if (
            this.dataType === "quantitative" &&
            this.observedDomain.length === 2
        ) {
            this.quantDomain = /** @type {number[]} */ (this.observedDomain);
        }
    }

    #onExplicitDomainSelected() {
        this.domainMode = "explicit";
        if (this.dataType === "quantitative" && this.quantDomain.length < 2) {
            const observed =
                this.observedDomain.length === 2
                    ? /** @type {number[]} */ (this.observedDomain)
                    : [0, 1];
            this.quantDomain = [...observed];
        }
    }

    #renderObservedDomainPreview() {
        const maxItems = 5;
        const previewItems = this.observedDomain.slice(0, maxItems);
        const hasMore = this.observedDomain.length > maxItems;
        return html`<span>
            Observed (${this.observedDomain.length}):
            ${previewItems.map((d) => html`<code>${String(d)}</code> `)}
            ${hasMore ? html`...` : ""}
        </span>`;
    }

    #renderDomainMode() {
        const isThreshold = this.scaleType === "threshold";
        return html`
            <div class="gs-form-group">
                <label for="observedDomainRadio">Domain Source</label>
                <div class="radio-group">
                    <label class="checkbox">
                        <input
                            id="observedDomainRadio"
                            type="radio"
                            name="domainMode"
                            value="observed"
                            ?checked=${this.domainMode === "observed"}
                            ?disabled=${isThreshold}
                            @change=${() => this.#onObservedDomainSelected()}
                        />
                        Use observed values (updates with data)
                    </label>
                    <label class="checkbox">
                        <input
                            type="radio"
                            name="domainMode"
                            value="explicit"
                            ?checked=${this.domainMode === "explicit"}
                            ?disabled=${isThreshold}
                            @change=${() => this.#onExplicitDomainSelected()}
                        />
                        Explicit domain (fixed)
                    </label>
                </div>
                ${this.domainMode === "observed" &&
                this.dataType !== "quantitative"
                    ? html`<div
                          style="margin-top: 0.35em; font-size: 0.9em; color: #555;"
                      >
                          ${this.#renderObservedDomainPreview()}
                      </div>`
                    : ""}
            </div>
        `;
    }

    /**
     * @param {boolean} showColorInputs
     */
    #renderDiscreteDomainInputs(showColorInputs) {
        return html`
            <div class="gs-form-group">
                <label>Domain and Range</label>
                <div class="domain-range-list">
                    ${this.domainPairs.map(
                        (pair, i) => html`
                            <div class="domain-range-row">
                                <input
                                    type="text"
                                    placeholder="Domain value"
                                    .value=${pair.domain}
                                    @input=${(/** @type {InputEvent} */ e) =>
                                        this.#updateDomainPair(
                                            i,
                                            "domain",
                                            /** @type {HTMLInputElement} */ (
                                                e.target
                                            ).value
                                        )}
                                />
                                ${showColorInputs
                                    ? html`
                                          <input
                                              class="btn"
                                              type="color"
                                              .value=${pair.range}
                                              @input=${(
                                                  /** @type {InputEvent} */ e
                                              ) =>
                                                  this.#updateDomainPair(
                                                      i,
                                                      "range",
                                                      /** @type {HTMLInputElement} */ (
                                                          e.target
                                                      ).value
                                                  )}
                                          />
                                      `
                                    : ""}
                                <button
                                    class="icon-btn"
                                    @click=${() => this.#removeDomainPair(i)}
                                    ?disabled=${this.domainPairs.length <= 1}
                                >
                                    ${icon(faTrash).node[0]}
                                </button>
                            </div>
                        `
                    )}
                    <button
                        class="icon-btn"
                        @click=${() => this.#addDomainPair()}
                    >
                        ${icon(faPlus).node[0]} Add Value
                    </button>
                </div>
            </div>
        `;
    }

    #renderQuantitativeSchemeControls() {
        return html` ${this.#renderSchemeSelector()} `;
    }

    #renderQuantDomainInputs(disabled = false) {
        return html`
            <div class="domain-inputs">
                <label style="display:flex;align-items:center;gap:0.4em;">
                    <span>Min</span>
                    <input
                        type="number"
                        .value=${String(
                            this.quantDomain[0] ?? this.observedDomain[0] ?? 0
                        )}
                        ?disabled=${disabled}
                        @input=${(/** @type {InputEvent} */ e) => {
                            const val = Number(
                                /** @type {HTMLInputElement} */ (e.target).value
                            );
                            const next = [...this.quantDomain];
                            next[0] = val;
                            if (next.length < 2) next[1] = val;
                            this.quantDomain = next;
                        }}
                    />
                </label>
                <label style="display:flex;align-items:center;gap:0.4em;">
                    <span>Max</span>
                    <input
                        type="number"
                        .value=${String(
                            this.quantDomain[1] ??
                                this.observedDomain[1] ??
                                this.quantDomain[0] ??
                                this.observedDomain[0] ??
                                1
                        )}
                        ?disabled=${disabled}
                        @input=${(/** @type {InputEvent} */ e) => {
                            const val = Number(
                                /** @type {HTMLInputElement} */ (e.target).value
                            );
                            const next = [...this.quantDomain];
                            next[1] = val;
                            if (next.length < 2) next[0] = val;
                            this.quantDomain = next;
                        }}
                    />
                </label>
            </div>
        `;
    }

    #renderDomainMidControl() {
        return html`
            <div class="gs-form-group">
                <label>Domain Midpoint</label>
                <input
                    type="number"
                    placeholder="Optional: midpoint for diverging scales"
                    .value=${this.domainMid != null
                        ? String(this.domainMid)
                        : ""}
                    @input=${(/** @type {InputEvent} */ e) => {
                        const value = /** @type {HTMLInputElement} */ (e.target)
                            .value;
                        this.domainMid = value === "" ? null : Number(value);
                    }}
                />
            </div>
        `;
    }

    #renderQuantitativeConfig() {
        return html`
            <div class="gs-form-group">
                <label for="scaleTypeSelect">Scale Type</label>
                <select
                    id="scaleTypeSelect"
                    .value=${this.scaleType}
                    @change=${(/** @type {Event} */ e) => {
                        const value = /** @type {HTMLSelectElement} */ (
                            e.target
                        ).value;
                        this.scaleType = /** @type {QuantScaleType} */ (value);
                        if (this.scaleType === "threshold") {
                            this.colorMode = "manual";
                            this.domainMode = "explicit";
                            if (this.thresholds.length === 0) {
                                this.thresholds = [0];
                            }
                            this.#ensureThresholdRangeLengths();
                        }
                    }}
                >
                    ${[
                        "linear",
                        "log",
                        "sqrt",
                        "pow",
                        "symlog",
                        "threshold",
                    ].map(
                        (option) => html`
                            <option value=${option}>${option}</option>
                        `
                    )}
                </select>
            </div>
        `;
    }

    #renderQuantitativeColorMode() {
        if (this.scaleType === "threshold") {
            return this.#renderThresholdControls();
        }
        if (this.colorMode === "scheme") {
            return this.#renderQuantitativeSchemeControls();
        }
        this.#ensureQuantDomainRangeLengths();
        return this.#renderQuantitativeColorPickers();
    }

    #renderThresholdControls() {
        return html`
            <div class="gs-form-group">
                <label>Thresholds</label>
                <div class="domain-range-list">
                    ${this.thresholds.map(
                        (threshold, i) => html`
                            <div class="domain-range-row">
                                <input
                                    type="number"
                                    .value=${String(threshold)}
                                    @input=${(/** @type {InputEvent} */ e) => {
                                        const value = Number(
                                            /** @type {HTMLInputElement} */ (
                                                e.target
                                            ).value
                                        );
                                        this.#updateThreshold(i, value);
                                    }}
                                />
                                <button
                                    class="icon-btn"
                                    @click=${() => this.#removeThreshold(i)}
                                    ?disabled=${this.thresholds.length <= 1}
                                >
                                    ${icon(faTrash).node[0]}
                                </button>
                            </div>
                        `
                    )}
                    <button
                        class="icon-btn"
                        @click=${() => this.#addThreshold()}
                    >
                        ${icon(faPlus).node[0]} Add Threshold
                    </button>
                </div>
            </div>
            <div class="gs-form-group">
                <label>Range colors</label>
                <div class="range-color-pickers">
                    ${this.thresholdRange.map(
                        (value, i) => html`
                            <label class="range-color-btn">
                                <span class="range-color-label">
                                    <strong>
                                        ${i === 0
                                            ? "Below"
                                            : i ===
                                                this.thresholdRange.length - 1
                                              ? "Above"
                                              : "Between"}
                                    </strong>
                                </span>
                                <input
                                    class="btn"
                                    type="color"
                                    .value=${value}
                                    @input=${(/** @type {InputEvent} */ e) =>
                                        this.#updateThresholdRange(
                                            i,
                                            /** @type {HTMLInputElement} */ (
                                                e.target
                                            ).value
                                        )}
                                />
                            </label>
                        `
                    )}
                </div>
            </div>
        `;
    }

    #renderQuantitativeColorPickers() {
        const min = this.quantDomain[0] ?? this.observedDomain[0] ?? 0;
        const max =
            this.quantDomain[1] ??
            this.observedDomain[1] ??
            this.quantDomain[0] ??
            1;
        const hasMidpoint = this.domainMid != null;
        const domainStops = hasMidpoint
            ? [min, this.domainMid, max]
            : [min, max];
        const stopLabels = hasMidpoint ? ["Min", "Mid", "Max"] : ["Min", "Max"];
        return html`
            <div class="gs-form-group">
                <label>Range colors</label>
                <div class="range-color-pickers">
                    ${domainStops.map((stop, i) => {
                        const label = stopLabels[i] ?? "";
                        const valueText = stop != null ? String(stop) : "";
                        return html`
                            <label class="range-color-btn">
                                <span class="range-color-label">
                                    <strong>${label}</strong>
                                    ${valueText
                                        ? html`<code>${valueText}</code>`
                                        : ""}
                                </span>
                                <input
                                    class="btn"
                                    type="color"
                                    .value=${this.quantRange[i] ??
                                    DEFAULT_COLOR}
                                    @input=${(/** @type {InputEvent} */ e) =>
                                        this.#updateQuantRange(
                                            i,
                                            /** @type {HTMLInputElement} */ (
                                                e.target
                                            ).value
                                        )}
                                />
                            </label>
                        `;
                    })}
                </div>
            </div>
        `;
    }

    #isDiscrete() {
        return isDiscreteDataType(this.dataType);
    }

    #renderDiscreteColorMode() {
        const explicitDomain = this.domainMode === "explicit";
        if (this.colorMode === "scheme") {
            return html`
                ${this.#renderSchemeSelector()}
                ${explicitDomain ? this.#renderDiscreteDomainInputs(false) : ""}
            `;
        }
        if (!explicitDomain) {
            return html`<div class="gs-alert info">
                Manual colors require an explicit domain.
            </div>`;
        }
        return this.#renderDiscreteDomainInputs(true);
    }

    renderBody() {
        if (this.#isDiscrete()) {
            return html`
                ${this.#renderDomainMode()} ${this.#renderColorModeSelector()}
                ${this.#renderDiscreteColorMode()}
            `;
        } else {
            const isThreshold = this.scaleType === "threshold";
            return html`
                ${this.#renderQuantitativeConfig()} ${this.#renderDomainMode()}
                ${isThreshold
                    ? ""
                    : this.#renderQuantDomainInputs(
                          this.domainMode === "observed"
                      )}
                ${isThreshold ? "" : this.#renderDomainMidControl()}
                ${this.#renderColorModeSelector()}
                ${this.#renderQuantitativeColorMode()}
            `;
        }
    }

    renderFooter() {
        return html`
            <div>
                <button class="btn" @click=${() => this.triggerClose()}>
                    Cancel
                </button>
                <button
                    class="btn btn-primary"
                    @click=${() => this.#validateAndSubmit()}
                >
                    Apply
                </button>
            </div>
        `;
    }
}

customElements.define("gs-configure-scale-dialog", ConfigureScaleDialog);
