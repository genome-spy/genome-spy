import { annotateSpecError } from "../utils/specError.js";

export default class ViewError extends Error {
    /**
     * @param {string} message
     * @param {import("./view.js").default} view
     */
    constructor(message, view) {
        super(message);
        this.name = "ViewError";
        this.view = view;
    }

    /**
     * Adds authored context without replacing a more specific error location.
     * @param {object} [source]
     * @param {(string | number)[]} [path]
     */
    withSpecLocation(source = this.view.spec, path = []) {
        annotateSpecError(
            this,
            this.view.paramRuntime.getSpecLocation(source, path)
        );
        return this;
    }
}
