import { html, render } from "lit";

import createBindingInputs from "../utils/inputBinding.js";

export default class InputBindingManager {
    /**
     * @param {HTMLElement} container
     * @param {import("../types/embedApi.js").EmbedOptions} options
     */
    constructor(container, options) {
        this._container = container;
        this._options = options;

        /** @type {HTMLElement} */
        this._inputBindingContainer = undefined;
    }

    /**
     * @param {import("../view/view.js").default} viewRoot
     */
    initialize(viewRoot) {
        /** @type {import("lit").TemplateResult[]} */
        const inputs = [];

        viewRoot.visit((view) => {
            const mediator = view.paramMediator;
            inputs.push(...createBindingInputs(mediator));
        });
        const ibc = this._options.inputBindingContainer;

        if (!ibc || ibc == "none" || !inputs.length) {
            return;
        }

        this._inputBindingContainer = document.createElement("div");
        this._inputBindingContainer.className = "gs-input-bindings";

        if (ibc == "default") {
            this._container.appendChild(this._inputBindingContainer);
        } else if (ibc instanceof HTMLElement) {
            ibc.appendChild(this._inputBindingContainer);
        } else {
            throw new Error("Invalid inputBindingContainer");
        }

        if (inputs.length) {
            render(
                html`<div class="gs-input-binding">${inputs}</div>`,
                this._inputBindingContainer
            );
        }
    }

    remove() {
        this._inputBindingContainer?.remove();
    }
}
