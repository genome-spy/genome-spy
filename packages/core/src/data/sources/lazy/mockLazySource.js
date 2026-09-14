import SingleAxisLazySource from "./singleAxisLazySource.js";
import { activateExprRefProps } from "../../../paramRuntime/paramUtils.js";
import {
    createDescriptorFieldAttacher,
    getUrlDescriptorExpressions,
    normalizeUrlDescriptors,
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

        this.params = activateExprRefProps(
            view.paramRuntime,
            params,
            () => {
                this.invalidateData();
                this.onDomainChanged();
            },
            (disposer) => this.registerDisposer(disposer),
            getUrlDescriptorExpressions(params.url)
        );
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
