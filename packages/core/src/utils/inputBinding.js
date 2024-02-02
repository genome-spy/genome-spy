import { html } from "lit-html";
import { debounce } from "./debounce.js";
import { tickStep } from "d3-array";

/**
 * @param {import("../view/paramMediator.js").default} mediator
 */
export default function createBindingInputs(mediator) {
    const random = Math.floor(Math.random() * 0xffffff).toString(16);

    /** @type {import("lit-html").TemplateResult[]} */
    const inputs = [];

    for (const param of mediator.paramConfigs.values()) {
        const bind = param.bind;
        if (!bind || !("input" in bind)) {
            continue;
        }

        const name = param.name;
        const setter = mediator.getSetter(name);
        const value = mediator.getValue(name);
        const label = bind.name ?? name;

        // TODO: Implement two-way data binding, e.g. when an external agent changes
        // the parameter value, the UI components should be updated.

        const debouncedSetter = bind.debounce
            ? debounce(setter, bind.debounce, false)
            : setter;

        const id = `${random}-param-${name}`;

        if (bind.input == "range") {
            // TODO: Show the value next to the slider
            inputs.push(
                html`<label for=${id}>${label}</label>
                    <div>
                        <input
                            id=${id}
                            type="range"
                            min=${bind.min ?? 0}
                            max=${bind.max ?? 100}
                            step=${bind.step ??
                            tickStep(bind.min, bind.max, 100)}
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
                        ?checked=${value}
                        @input=${(/** @type {any} */ e) =>
                            debouncedSetter(e.target.checked)}
                    />`
            );
        } else if (bind.input == "radio") {
            inputs.push(
                html`<span class="label">${label}</span>
                    <div class="radio-group">
                        ${bind.options.map(
                            (option, i) => html`<label>
                                <input
                                    type="radio"
                                    name=${name}
                                    value=${option}
                                    .checked=${value == option}
                                    @input=${(/** @type {any} */ e) =>
                                        debouncedSetter(e.target.value)}
                                />${bind.labels?.[i] ?? option}</label
                            >`
                        )}
                    </div>`
            );
        } else if (bind.input == "select") {
            inputs.push(
                html`<label for=${id}>${label}</label>
                    <select
                        id=${id}
                        @input=${(/** @type {any} */ e) =>
                            debouncedSetter(e.target.value)}
                    >
                        ${bind.options.map(
                            (option, i) => html`<option
                                value=${option}
                                ?selected=${value == option}
                            >
                                ${bind.labels?.[i] ?? option}
                            </option>`
                        )}
                    </select> `
            );
        } else {
            // TODO: Support other types: "text", "number", "color".
            throw new Error("Unsupported input type: " + bind.input);
        }

        if (bind.description) {
            inputs.push(
                html`<div class="description">${bind.description}</div>`
            );
        }
    }

    return inputs;
}
