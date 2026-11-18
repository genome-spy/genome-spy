import { html, nothing } from "lit";
import { debounce } from "./debounce.js";
import { tickStep } from "d3-array";
import { isVariableParameter } from "../paramRuntime/paramUtils.js";

const bindingIdPrefix = "gs-param-" + Math.random().toString(36).slice(2);
let nextBindingId = 0;

/**
 * @param {{
 *   paramConfigs: ReadonlyMap<string, import("../spec/parameter.js").Parameter>,
 *   setValue: (name: string, value: any) => void,
 *   getValue: (name: string) => any,
 *   getTargetValue?: (name: string) => any
 * }} mediator
 */
export default function createBindingInputs(mediator) {
    /** @type {import("lit").TemplateResult[]} */
    const inputs = [];

    for (const param of mediator.paramConfigs.values()) {
        if (!isVariableParameter(param)) {
            continue;
        }
        const bind = param.bind;
        if (!bind || !("input" in bind)) {
            continue;
        }

        const name = param.name;
        const setter = (
            /** @type {any} */
            value
        ) => {
            mediator.setValue(name, value);
        };
        const value =
            mediator.getTargetValue?.(name) ?? mediator.getValue(name);
        const label = bind.name ?? name;

        // TODO: Implement two-way data binding, e.g. when an external agent changes
        // the parameter value, the UI components should be updated.

        const debouncedSetter = bind.debounce
            ? debounce(setter, bind.debounce, false)
            : setter;

        const id = `${bindingIdPrefix}-${nextBindingId++}`;
        const descriptionId = bind.description ? id + "-description" : nothing;

        if (bind.input == "range") {
            inputs.push(
                html`<label for=${id}>${label}</label>
                    <div>
                        <input
                            id=${id}
                            type="range"
                            aria-describedby=${descriptionId}
                            min=${bind.min ?? 0}
                            max=${bind.max ?? 100}
                            step=${
                                bind.step ?? tickStep(bind.min, bind.max, 100)
                            }
                            .value=${value}
                            @input=${(/** @type {any} */ e) => {
                                debouncedSetter(e.target.valueAsNumber);
                                e.target.nextElementSibling.textContent =
                                    e.target.valueAsNumber;
                            }}
                        /><span>${value}</span>
                    </div>`
            );
        } else if (bind.input == "checkbox") {
            inputs.push(
                html`<label for=${id}>${label}</label>
                    <input
                        id=${id}
                        type="checkbox"
                        aria-describedby=${descriptionId}
                        ?checked=${value}
                        @input=${(/** @type {any} */ e) =>
                            debouncedSetter(e.target.checked)}
                    />`
            );
        } else if (bind.input == "radio") {
            const labelId = id + "-label";
            inputs.push(
                html`<span id=${labelId} class="label">${label}</span>
                    <div
                        class="radio-group"
                        role="radiogroup"
                        aria-labelledby=${labelId}
                        aria-describedby=${descriptionId}
                    >
                        ${bind.options.map((option, i) => {
                            const optionId = `${id}-option-${i}`;
                            return html`<label for=${optionId}>
                                <input
                                    id=${optionId}
                                    type="radio"
                                    name=${id}
                                    value=${option}
                                    .checked=${value == option}
                                    @input=${(/** @type {any} */ e) =>
                                        debouncedSetter(e.target.value)}
                                />${bind.labels?.[i] ?? option}</label
                            >`;
                        })}
                    </div>`
            );
        } else if (bind.input == "select") {
            inputs.push(
                html`<label for=${id}>${label}</label>
                    <select
                        id=${id}
                        aria-describedby=${descriptionId}
                        @input=${(/** @type {any} */ e) =>
                            debouncedSetter(e.target.value)}
                    >
                        ${bind.options.map(
                            (option, i) =>
                                html`<option
                                    value=${option}
                                    ?selected=${value == option}
                                >
                                    ${bind.labels?.[i] ?? option}
                                </option>`
                        )}
                    </select> `
            );
        } else if (
            bind.input == "text" ||
            bind.input == "number" ||
            bind.input == "color"
        ) {
            inputs.push(
                html`<label for=${id}>${label}</label>
                    <div>
                        <input
                            id=${id}
                            type=${bind.input}
                            aria-describedby=${descriptionId}
                            placeholder=${bind.placeholder ?? ""}
                            autocomplete=${bind.autocomplete ?? "off"}
                            .value=${value}
                            @focus=${(/** @type {any} */ e) =>
                                e.target.select()}
                            @input=${(/** @type {any} */ e) => {
                                debouncedSetter(
                                    bind.input == "number"
                                        ? e.target.valueAsNumber
                                        : e.target.value
                                );
                            }}
                        />
                    </div>`
            );
        } else {
            throw new Error("Unsupported input type: " + bind.input);
        }

        if (bind.description) {
            inputs.push(
                html`<div id=${descriptionId} class="description">
                    ${bind.description}
                </div>`
            );
        }
    }

    return inputs;
}
