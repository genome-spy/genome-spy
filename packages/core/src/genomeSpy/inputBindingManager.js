import { html, render } from "lit";

import createBindingInputs from "../utils/inputBinding.js";

export default class InputBindingManager {
    /** @type {HTMLElement} */
    #container;
    /** @type {import("../types/embedApi.js").EmbedOptions} */
    #options;
    /** @type {HTMLElement} */
    #inputBindingContainer;

    /**
     * @param {HTMLElement} container
     * @param {import("../types/embedApi.js").EmbedOptions} options
     */
    constructor(container, options) {
        this.#container = container;
        this.#options = options;

        this.#inputBindingContainer = undefined;
    }

    /**
     * @param {import("../view/view.js").default} viewRoot
     */
    initialize(viewRoot) {
        /** @type {import("lit").TemplateResult[]} */
        const inputs = [];

        viewRoot.visit((view) => {
            const mediator = view.paramRuntime;
            inputs.push(...createBindingInputs(mediator));
        });
        const ibc = this.#options.inputBindingContainer;

        if (!ibc || ibc == "none" || !inputs.length) {
            return;
        }

        this.#inputBindingContainer = document.createElement("div");
        this.#inputBindingContainer.className = "gs-input-bindings";

        if (ibc == "default") {
            this.#container.appendChild(this.#inputBindingContainer);
        } else if (ibc instanceof HTMLElement) {
            ibc.appendChild(this.#inputBindingContainer);
        } else {
            throw new Error("Invalid inputBindingContainer");
        }

        if (inputs.length) {
            render(
                html`<div class="gs-input-binding">${inputs}</div>`,
                this.#inputBindingContainer
            );
        }
    }

    remove() {
        this.#inputBindingContainer?.remove();
    }
}
