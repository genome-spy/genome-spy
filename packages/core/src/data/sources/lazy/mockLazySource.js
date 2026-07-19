import SingleAxisLazySource from "./singleAxisLazySource.js";
import {
    createDescriptorFieldAttacher,
    normalizeUrlDescriptors,
    watchUrlDescriptorExpressions,
} from "../urlDescriptor.js";

/**
 * Testing-only lazy data source that delays data publishing.
 * Register via registerLazyDataSource in tests to avoid production exposure.
 */
export default class MockLazySource extends SingleAxisLazySource {
    /**
     * @param {{ channel?: import("../../../spec/channel.js").PrimaryPositionalChannel, delay?: number, data?: import("../../flowNode.js").Datum[], url?: any }} params
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

        if (params.url && typeof params.url == "object") {
            watchUrlDescriptorExpressions({
                url: params.url,
                paramRuntime: view.paramRuntime,
                listener: () => {
                    this.invalidateData();
                    this.onDomainChanged();
                },
                registerDisposer: (disposer) => this.registerDisposer(disposer),
            });
        }
    }

    /**
     * @override
     */
    onDomainChanged() {
        if (this.pendingTimer) {
            clearTimeout(this.pendingTimer);
            this.pendingTimer = undefined;
        }

        this.setLoadingStatus("loading");
        this.pendingTimer = setTimeout(() => {
            this.pendingTimer = undefined;
            this.#resolveData()
                .then((data) => {
                    this.publishData([data]);
                    this.setLoadingStatus("complete");
                    this.requestRender();
                })
                .catch((e) => {
                    this.load();
                    this.setLoadingStatus("error", e.message);
                });
        }, this.delay);
    }

    async #resolveData() {
        if (!this.params.url) {
            return this.params.data ?? [];
        }

        const descriptors = await normalizeUrlDescriptors({
            url: this.params.url,
            baseUrl: this.view.getBaseUrl(),
            paramRuntime: this.view.paramRuntime,
        });

        return descriptors.flatMap((descriptor, i) => {
            const rows = this.params.data ?? [{ x: i, value: descriptor.url }];
            const attachFields = createDescriptorFieldAttacher(
                descriptor.fields
            );
            return rows.map((datum) => attachFields({ ...datum }));
        });
    }
}
