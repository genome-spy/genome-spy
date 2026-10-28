import DataSource from "@genome-spy/core/data/sources/dataSource.js";
import { getMetadataSourceRuntime } from "./metadataSourceRuntimeState.js";

/** Loads the fixed sample universe before metadata-column imports. */
export default class MetadataIdentitySource extends DataSource {
    /** @type {import("../sampleView.js").default} */
    #sampleView;

    /** @type {{metadataSource?: string; displayNameField?: string}} */
    #identity;

    #controller = new AbortController();

    /**
     * @param {{metadataSource?: string; displayNameField?: string}} identity
     * @param {import("../sampleView.js").default} view
     */
    constructor(identity, view) {
        super(view);
        this.#sampleView = view;
        this.#identity = identity;
        this.registerDisposer(() => this.#controller.abort());
    }

    get label() {
        return "metadataIdentitySource";
    }

    async load() {
        if (this.disposed) return;
        const signal = this.#controller.signal;
        this.setLoadingStatus("loading");

        try {
            const runtime = getMetadataSourceRuntime(this.#sampleView);
            const source = await runtime.getSource(
                this.#identity.metadataSource
            );
            signal.throwIfAborted();
            const adapter = await runtime.getAdapter(source);
            signal.throwIfAborted();
            const samples = await adapter.listSamples(
                {
                    displayNameField: this.#identity.displayNameField,
                },
                signal
            );
            signal.throwIfAborted();

            if (samples.some((sample) => sample.id === "")) {
                throw new Error("Sample identity contains an empty sample id.");
            }

            this.reset();
            this.beginBatch({ type: "file" });
            for (const sample of samples) this._propagate(sample);
            this.complete();
            this.setLoadingStatus("complete");
        } catch (error) {
            if (!this.disposed) this.setLoadingStatus("error", String(error));
            throw error;
        }
    }
}
