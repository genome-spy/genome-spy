import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import { findLegendScaleResolution } from "./legendEntriesSource.js";
import DataSource from "../dataSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";

const DEFAULT_SAMPLE_COUNT = 64;
const DEFAULT_RAMP_THICKNESS = 12;

export default class LegendGradientSource extends DataSource {
    /** @type {import("../../../spec/channel.js").Scalar[] | undefined} */
    #domain = undefined;

    /**
     * @param {import("../../../spec/data.js").LegendGradientData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view);

        this.params = params;
        this.scaleResolution = findLegendScaleResolution(view, params.channel);
        if (!this.scaleResolution) {
            throw new Error(
                `The gradient legend data source cannot find a resolved scale for channel "${params.channel}".`
            );
        }

        const publish = () => this.#publishEntries();
        this.scaleResolution.addEventListener("domain", publish);
        this.view.registerDisposer(() =>
            this.scaleResolution.removeEventListener("domain", publish)
        );
    }

    get label() {
        return "legendGradientSource";
    }

    async load() {
        this.#domain = undefined;
        this.#publishEntries();
    }

    #publishEntries() {
        const domain = this.scaleResolution.getDomain();

        if (!this.#domain || !shallowArrayEquals(domain, this.#domain)) {
            const start = Number(domain[0]);
            const stop = Number(domain.at(-1));
            if (!Number.isFinite(start) || !Number.isFinite(stop)) {
                throw new Error(
                    "Gradient legends require a finite numeric scale domain."
                );
            }

            this.#domain = domain.slice();
            this.reset();
            this.beginBatch({ type: "file" });

            const count = this.params.count ?? DEFAULT_SAMPLE_COUNT;
            for (let index = 0; index < count; index++) {
                const t = (index + 0.5) / count;
                this._propagate({
                    value: start + (stop - start) * t,
                    _legendGradientIndex: index,
                    _legendGradientX: 0,
                    _legendGradientX2: DEFAULT_RAMP_THICKNESS,
                    _legendGradientY: index,
                    _legendGradientY2: index + 1,
                });
            }

            this.complete();
        }
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").LegendGradientData}
 */
function isLegendGradientSource(params) {
    return params?.type == "legendGradient";
}

registerBuiltInLazyDataSource(isLegendGradientSource, LegendGradientSource);
