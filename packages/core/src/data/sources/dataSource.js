import { runFlowPublication } from "../flowOutput.js";
import FlowNode from "../flowNode.js";

export default class DataSource extends FlowNode {
    /** Whether the current rows came from a successful completion fan-out. */
    resultSuccessful = false;

    /**
     * @type {import("../../view/view.js").default}
     */
    view;

    /** @type {string | undefined} Authored declaration context, independent of sharing keys. */
    origin;

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
     * @param {import("../../types/embedApi.js").DataLoadingEntry["errorPhase"]} [errorPhase]
     * @param {import("../../types/embedApi.js").SpecLocation} [errorLocation]
     * @protected
     */
    setLoadingStatus(status, detail, errorPhase, errorLocation) {
        this.view.context.dataFlow.loadingStatusRegistry.setSource(
            this,
            status,
            detail,
            errorPhase,
            errorLocation
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

    /**
     * Completes a snapshot and publishes transform outputs on success.
     * Completion that only clears rows or finishes a failed load must pass false.
     * @param {boolean} [successful]
     */
    complete(successful = true) {
        const runtime = this.view?.paramRuntime;
        // Standalone dataflow tests can omit a view runtime. A live source's
        // entire completion fan-out publishes in one synchronous boundary.
        this.resultSuccessful = false;
        runFlowPublication(
            this,
            () => {
                super.complete();
                this.resultSuccessful = successful;
            },
            runtime,
            successful
        );
    }

    reset() {
        this.resultSuccessful = false;
        super.reset();
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
