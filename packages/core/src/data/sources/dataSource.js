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
     * Returns an opaque identity used for merging equivalent data sources.
     *
     * @returns {unknown}
     */
    get shareKey() {
        return this.identifier;
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

    get paramRuntime() {
        return this.view.paramRuntime;
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

    complete() {
        const runtime = this.view?.paramRuntime;
        // Standalone dataflow tests can omit a view runtime. A live source's
        // entire completion fan-out publishes in one synchronous boundary.
        if (runtime) runtime.runInTransaction(() => super.complete());
        else super.complete();
    }

    /**
     * Starts live reactions that should not run before the initial load phase.
     */
    activate() {
        // override
    }

    get replaySource() {
        return this;
    }

    get replaysSynchronously() {
        return "loadSynchronously" in this;
    }

    repropagate() {
        this.activate();
        if (
            "loadSynchronously" in this &&
            typeof this.loadSynchronously === "function"
        ) {
            // Preserve synchronous row errors instead of detaching them in the
            // promise returned by load(). Async sources retain their own path.
            this.loadSynchronously();
        } else {
            void this.load();
        }
    }
}
