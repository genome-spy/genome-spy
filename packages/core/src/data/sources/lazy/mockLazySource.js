import SingleAxisLazySource from "./singleAxisLazySource.js";

/**
 * Testing-only lazy data source that delays data publishing.
 * Register via registerLazyDataSource in tests to avoid production exposure.
 */
export default class MockLazySource extends SingleAxisLazySource {
    /**
     * @param {{ channel?: import("../../../spec/channel.js").PrimaryPositionalChannel, delay?: number, data?: import("../../flowNode.js").Datum[] }} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view, params.channel ?? "x");

        this.params = params;
        this.delay = params.delay ?? 0;
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        this.pendingTimer = undefined;

        this.view.registerDisposer(() => {
            if (this.pendingTimer) {
                clearTimeout(this.pendingTimer);
                this.pendingTimer = undefined;
            }
        });
    }

    /**
     * @override
     */
    onDomainChanged() {
        if (this.pendingTimer) {
            clearTimeout(this.pendingTimer);
            this.pendingTimer = undefined;
        }

        const data = this.params.data ?? [];
        this.pendingTimer = setTimeout(() => {
            this.pendingTimer = undefined;
            this.publishData([data]);
            this.requestRender();
        }, this.delay);
    }
}
