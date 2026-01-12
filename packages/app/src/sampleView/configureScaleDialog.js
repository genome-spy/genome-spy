import { html, css } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import BaseDialog from "../components/generic/baseDialog.js";
import "../components/generic/customSelect.js";
import { SCHEME_NAMES, schemeToDataUrl } from "../utils/ui/schemeToDataUrl.js";

/**
 * @typedef {"nominal" | "ordinal" | "quantitative"} DataType
 * @typedef {"linear" | "log" | "pow" | "sqrt" | "symlog"} QuantScaleType
 * @typedef {"scheme" | "manual"} ColorMode
 *
 * @typedef {object} DomainRangePair
 * @prop {string} domain
 * @prop {string} range
 */

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
        colorMode: { type: String },
        domainMode: { type: String },
        scheme: { type: String },
        scaleType: { type: String },
        domainPairs: { type: Array },
        quantDomain: { type: Array },
        quantRange: { type: Array },
        domainMid: { type: Number },
    };

    constructor() {
        super();

        /** @type {DataType} */
        this.dataType = "quantitative";
        /** @type {(string | number)[]} */
        this.observedDomain = [];
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
    }

    connectedCallback() {
        super.connectedCallback();
        this.#initializeFromProps();
    }

    #initializeFromProps() {
        // Ensure dataType is set (no-op since property defaults to "quantitative")
        if (
            this.dataType === "quantitative" &&
            this.quantDomain.length === 0 &&
            this.observedDomain.length === 2
        ) {
            this.quantDomain = /** @type {number[]} */ (this.observedDomain);
        }

        if (
            this.dataType !== "quantitative" &&
            this.domainPairs.length === 0 &&
            this.observedDomain.length > 0
        ) {
            this.domainPairs = this.observedDomain.map((d) => ({
                domain: String(d),
                range: "#808080",
            }));
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
            { domain: "", range: "#808080" },
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

    #ensureQuantDomainRangeLengths() {
        const hasObserved = this.observedDomain.length === 2;
        const defaultMin = hasObserved ? Number(this.observedDomain[0]) : 0;
        const defaultMax = hasObserved ? Number(this.observedDomain[1]) : 1;

        const domain = [...this.quantDomain];
        if (domain.length === 0) {
            domain.push(defaultMin, defaultMax);
        } else if (domain.length === 1) {
            domain.push(defaultMax);
        }

        const min = domain[0] ?? defaultMin;
        const max = domain[domain.length - 1] ?? defaultMax;
        const normalizedDomain = [min, max];

        if (
            this.quantDomain.length !== normalizedDomain.length ||
            normalizedDomain.some((v, i) => v !== this.quantDomain[i])
        ) {
            this.quantDomain = normalizedDomain;
        }

        const domainStops =
            this.domainMid != null
                ? [min, this.domainMid, max]
                : normalizedDomain;
        const desiredRangeLength = domainStops.length;
        let range = [...this.quantRange];
        if (range.length < desiredRangeLength) {
            const last = range[range.length - 1] ?? "#808080";
            while (range.length < desiredRangeLength) {
                range.push(last);
            }
        } else if (range.length > desiredRangeLength) {
            range = range.slice(0, desiredRangeLength);
        }

        if (
            range.length !== this.quantRange.length ||
            range.some((v, i) => v !== this.quantRange[i])
        ) {
            this.quantRange = range;
        }
    }

    #validateAndSubmit() {
        const scale = this.#buildScale();
        if (scale) {
            this.finish({ ok: true, data: scale });
            this.triggerClose();
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
     * @returns {import("@genome-spy/core/spec/scale.js").Scale | null}
     */
    #buildQuantitativeScale() {
        /** @type {import("@genome-spy/core/spec/scale.js").Scale} */
        const scale = {
            type: this.scaleType,
        };

        if (this.colorMode === "scheme") {
            scale.scheme = this.scheme;
            if (this.domainMid != null) {
                scale.domainMid = this.domainMid;
            }
            if (this.domainMode === "explicit") {
                scale.domain = this.quantDomain;
            }
        } else {
            // Manual mode
            if (this.domainMode !== "explicit") {
                return null;
            }
            if (this.quantDomain.length !== this.quantRange.length) {
                return null;
            }
            scale.domain = this.quantDomain;
            scale.range = this.quantRange;
        }

        return scale;
    }

    /**
     * @returns {import("@genome-spy/core/spec/scale.js").Scale | null}
     */
    #buildDiscreteScale() {
        /** @type {import("@genome-spy/core/spec/scale.js").Scale} */
        const scale = {
            type: "ordinal",
        };

        if (this.colorMode === "scheme") {
            scale.scheme = this.scheme;
            if (this.domainMode === "explicit") {
                const validPairs = this.domainPairs.filter(
                    (p) => p.domain.trim() !== ""
                );
                if (validPairs.length > 0) {
                    scale.domain = validPairs.map((p) => p.domain);
                }
            }
        } else {
            if (this.domainMode !== "explicit") {
                return null;
            }
            const validPairs = this.domainPairs.filter(
                (p) => p.domain.trim() !== ""
            );
            if (validPairs.length === 0) {
                return null;
            }
            scale.domain = validPairs.map((p) => p.domain);
            scale.range = validPairs.map((p) => p.range);
        }

        return scale;
    }

    // Data type selection is managed externally; do not render radio buttons here.

    #renderColorModeSelector() {
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
        if (this.colorMode === "manual") {
            this.colorMode = "scheme";
        }
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
        return html`<span>
            Observed (${this.observedDomain.length}):
            ${this.observedDomain.map((d) => html`<code>${String(d)}</code> `)}
        </span>`;
    }

    #renderDomainMode() {
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
        if (this.domainMode === "explicit" && this.colorMode !== "scheme") {
            this.#ensureQuantDomainRangeLengths();
        }

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
                    }}
                >
                    ${["linear", "log", "sqrt", "pow", "symlog"].map(
                        (option) => html`
                            <option value=${option}>${option}</option>
                        `
                    )}
                </select>
            </div>
        `;
    }

    #renderQuantitativeColorMode() {
        if (this.colorMode === "scheme") {
            return this.#renderQuantitativeSchemeControls();
        }
        this.#ensureQuantDomainRangeLengths();
        return this.#renderQuantitativeColorPickers();
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
                                    .value=${this.quantRange[i] ?? "#808080"}
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
        return this.dataType === "nominal" || this.dataType === "ordinal";
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
            return html`
                ${this.#renderQuantitativeConfig()} ${this.#renderDomainMode()}
                ${this.#renderQuantDomainInputs(this.domainMode === "observed")}
                ${this.#renderDomainMidControl()}
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
