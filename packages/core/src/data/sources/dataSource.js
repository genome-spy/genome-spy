import FlowNode from "../flowNode.js";

export default class DataSource extends FlowNode {
    /**
     * @type {import("../../view/view.js").default}
     */
    view;

    /**
     * @param {import("../../view/view.js").default} view
     */
    constructor(view) {
        super();

        this.view = view;
    }

    /**
     * Returns a string that identifies a data source. Data sources with the
     * same identifier can be merged.
     *
     * @return {string}
     */
    get identifier() {
        return undefined;
    }

    /**
     * Sets the loading status of the data source. The status is shown in the UI.
     *
     * @param {import("../../types/viewContext.js").DataLoadingStatus} status
     * @param {string} [detail] The error message
     * @protected
     */
    setLoadingStatus(status, detail) {
        this.view.context.dataFlow.loadingStatusRegistry.set(
            this.view,
            status,
            detail
        );
    }

    get paramMediator() {
        return this.view.paramMediator;
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        throw new Error("Source does not handle incoming data!");
    }

    async load() {
        // override
    }

    repropagate() {
        this.load();
    }
}
