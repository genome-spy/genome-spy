import { html, nothing } from "lit";

/**
 * Reactive form controller that keeps field values in the host component and
 * manages validation state for inputs wired via {@link formField}.
 *
 * @example
 * ```js
 * this._form = new FormController(this);
 * this._form.defineField("name", {
 *     valueKey: "attributeName",
 *     validate: () => this.#validateName(),
 * });
 * this._form.defineField("group", {
 *     valueKey: "groupPath",
 *     validate: () => null,
 *     affects: ["name"],
 * });
 *
 * html`
 *   <input type="text" \${formField(this._form, "name")} />
 *   \${this._form.feedback("name")}
 *   <input type="text" \${formField(this._form, "group")} />
 * `;
 * ```
 */
export class FormController {
    /**
     * @param {import("lit").ReactiveControllerHost} host
     */
    constructor(host) {
        /** @type {import("lit").ReactiveControllerHost} */
        this._host = host;

        /** @type {Map<string, FieldConfig>} */
        this._fields = new Map();

        /** @type {Map<string, string>} */
        this._errors = new Map();

        host.addController(this);
    }

    /**
     * @returns {void}
     */
    hostConnected() {}

    /**
     * @returns {void}
     */
    hostDisconnected() {}

    /**
     * Registers a field by name and links it to a host property and validator.
     * Define all fields once during construction.
     *
     * @param {string} name
     * @param {FieldConfig} config
     */
    defineField(name, config) {
        if (this._fields.has(name)) {
            throw new Error("Field already defined: " + name);
        }

        this._fields.set(name, config);
    }

    /**
     * @param {string} name
     * @returns {string}
     */
    getValue(name) {
        const config = this.#getFieldConfig(name);
        return /** @type {any} */ (this._host)[config.valueKey];
    }

    /**
     * @param {string} name
     * @param {string} value
     */
    setValue(name, value) {
        const config = this.#getFieldConfig(name);
        /** @type {any} */ (this._host)[config.valueKey] = value;
    }

    /**
     * @param {string} name
     * @returns {string | null}
     */
    validateField(name) {
        const config = this.#getFieldConfig(name);
        return config.validate(this.getValue(name));
    }

    /**
     * @param {string} name
     * @returns {string | null}
     */
    error(name) {
        const error = this._errors.get(name);
        if (error) {
            return error;
        } else {
            return null;
        }
    }

    /**
     * Runs the field validator and updates its error entry.
     * Use this after input/blur or when a dependency changes.
     *
     * @param {string} name
     */
    revalidate(name) {
        const error = this.validateField(name);
        this.#setFieldError(name, error);
    }

    /**
     * Returns fields that should be revalidated when this field changes.
     * Useful for cross-field constraints (e.g., name depends on group).
     *
     * @param {string} name
     * @returns {string[]}
     */
    getAffectedFields(name) {
        const config = this.#getFieldConfig(name);
        if (config.affects) {
            return config.affects;
        } else {
            return [];
        }
    }

    /**
     * Validates every field, updates the error map, and requests a host update.
     * Returns true when errors are present (for submission guards).
     *
     * @returns {boolean}
     */
    validateAll() {
        /** @type {Map<string, string>} */
        const errors = new Map();
        for (const name of this._fields.keys()) {
            const error = this.validateField(name);
            if (error) {
                errors.set(name, error);
            }
        }
        this._errors = errors;
        this._host.requestUpdate();
        return errors.size > 0;
    }

    /**
     * Fast validation pass that does not mutate error state.
     * Intended for disabling submit buttons.
     *
     * @returns {boolean}
     */
    hasErrors() {
        for (const name of this._fields.keys()) {
            if (this.validateField(name)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Clears validation errors without touching field values.
     *
     * @returns {void}
     */
    reset() {
        this._errors = new Map();
        this._host.requestUpdate();
    }

    /**
     * Returns a rendered error message block for the field, or nothing.
     * Use directly in templates below the input element.
     *
     * @param {string} name
     * @returns {import("lit").TemplateResult | typeof nothing}
     */
    feedback(name) {
        const error = this.error(name);
        if (error) {
            return html`<div class="invalid-feedback">${error}</div>`;
        } else {
            return nothing;
        }
    }

    /**
     * @param {string} name
     * @returns {FieldConfig}
     */
    #getFieldConfig(name) {
        const config = this._fields.get(name);
        if (config) {
            return config;
        } else {
            throw new Error("Unknown field: " + name);
        }
    }

    /**
     * @param {string} name
     * @param {string | null} error
     */
    #setFieldError(name, error) {
        const next = new Map(this._errors);
        if (error) {
            next.set(name, error);
        } else {
            next.delete(name);
        }
        this._errors = next;
        this._host.requestUpdate();
    }
}

/**
 * @typedef {(value: string) => string | null} ValidatorFn
 */

/**
 * @typedef {{
 *   valueKey: string,
 *   validate: ValidatorFn,
 *   affects?: string[],
 * }} FieldConfig
 */
