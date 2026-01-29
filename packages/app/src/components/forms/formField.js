import { Directive, directive, PartType } from "lit/directive.js";
import { nothing } from "lit";

class FormFieldDirective extends Directive {
    /**
     * @param {import("lit/directive.js").PartInfo} partInfo
     */
    constructor(partInfo) {
        super(partInfo);
        if (partInfo.type !== PartType.ELEMENT) {
            throw new Error("formField must be used on an element part.");
        }

        /** @type {AbortController | null} */
        this._abortController = null;
    }

    /**
     * @param {import("./formController.js").FormController} form
     * @param {string} name
     * @param {FormFieldOptions} [options]
     * @returns {typeof nothing}
     */
    render(form, name, options) {
        return nothing;
    }

    /**
     * Wires element state and event handlers to the form controller.
     * Revalidates dependent fields on input/blur and updates the invalid UI state.
     *
     * @param {import("lit").ElementPart} part
     * @param {[import("./formController.js").FormController, string, FormFieldOptions | undefined]} args
     * @returns {typeof nothing}
     */
    update(part, args) {
        const [form, name, options] = args;
        const validateOnInput =
            options?.validateOnInput === "always" ? "always" : "onError";

        const element = part.element;
        if (
            !(
                element instanceof HTMLInputElement ||
                element instanceof HTMLTextAreaElement ||
                element instanceof HTMLSelectElement
            )
        ) {
            throw new Error(
                "formField requires an input, textarea, or select element."
            );
        }
        const value = form.getValue(name);
        if (element.value !== value) {
            element.value = value;
        }

        const updateValidity = () => {
            const error = form.error(name);
            if (error) {
                element.classList.add("is-invalid");
                element.setAttribute("aria-invalid", "true");
            } else {
                element.classList.remove("is-invalid");
                element.setAttribute("aria-invalid", "false");
            }
        };

        if (this._abortController) {
            this._abortController.abort();
        }
        this._abortController = new AbortController();

        const onInput = (/** @type {InputEvent} */ event) => {
            const target =
                /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} */ (
                    event.currentTarget
                );
            form.setValue(name, target.value);
            if (validateOnInput === "always" || form.error(name)) {
                form.revalidate(name);
            }

            for (const affected of form.getAffectedFields(name)) {
                if (form.error(affected)) {
                    form.revalidate(affected);
                }
            }

            updateValidity();
        };

        const onBlur = () => {
            form.revalidate(name);
            for (const affected of form.getAffectedFields(name)) {
                form.revalidate(affected);
            }
            updateValidity();
        };

        element.addEventListener("input", onInput, {
            signal: this._abortController.signal,
        });
        element.addEventListener("blur", onBlur, {
            signal: this._abortController.signal,
        });

        updateValidity();
        return nothing;
    }
}

/**
 * Wires an input-like element to a {@link FormController} field.
 * Uses event listeners with AbortController so other handlers can coexist.
 *
 * @example
 * ```js
 * this._form.defineField("name", {
 *     valueKey: "attributeName",
 *     validate: () => this.#validateName(),
 * });
 *
 * html`
 *   <input type="text" \${formField(this._form, "name")} />
 *   \${this._form.feedback("name")}
 * `;
 * ```
 *
 * @param {import("./formController.js").FormController} form
 * @param {string} name
 * @param {FormFieldOptions} [options]
 */
export const formField = directive(FormFieldDirective);

/**
 * @typedef {{
 *  validateOnInput?: "always" | "onError",
 * }} FormFieldOptions
 */
