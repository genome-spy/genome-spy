export default class ViewError extends Error {
    /**
     * @param {string} message
     * @param {import("../view/view.js").default} view
     */
    constructor(message, view) {
        super(message);
        this.name = "ViewError";
        this.view = view;
    }
}
