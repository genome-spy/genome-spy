import DataSource from "../dataSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import { hasEffectiveGroupingGaps } from "../../../genome/indexGapMapping.js";
import deepEqual from "../../../utils/deepEqual.js";

/**
 * @param {readonly number[]} extent A normalized half-open extent.
 * @param {readonly number[]} cuts Sorted, unique cut positions.
 * @returns {[number, number][]}
 */
export function splitScaleGroups(extent, cuts) {
    if (!extent.length) return [];
    if (extent.length !== 2 || !extent.every(Number.isFinite)) {
        throw new Error("scaleGroups requires a finite full extent.");
    }
    if (extent[0] > extent[1])
        throw new Error("scaleGroups requires normalized ascending bounds.");

    // A reversed inclusive domain can extend below zero. Generated endpoints
    // must stay in the nonnegative coordinate space accepted by GPU indices.
    const start = Math.max(0, extent[0]);
    const end = Math.max(0, extent[1]);
    if (start === end) return [];

    const boundaries = [
        start,
        ...cuts.filter((cut) => cut > start && cut < end),
        end,
    ];
    return boundaries.slice(1).map((end, i) => [boundaries[i], end]);
}

export default class ScaleGroupsSource extends DataSource {
    #active = false;

    #loaded = false;

    #ready = false;

    /** @type {{extent: readonly number[], cuts: readonly number[], ready: boolean}[] | undefined} */
    #snapshot;

    /** @param {import("../../../spec/data.js").ScaleGroupsData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view);
        this.params = params;
        const channels = params.channels;
        if (
            !channels.length ||
            new Set(channels).size !== channels.length ||
            channels.some((channel) => channel !== "x" && channel !== "y")
        ) {
            throw new Error(
                "scaleGroups channels must be a nonempty, unique list of x and/or y."
            );
        }
        this.axes = channels.map((channel) => {
            const resolution = view.getScaleResolution(channel);
            if (
                !resolution ||
                !["index", "locus"].includes(resolution.getResolvedScaleType())
            ) {
                throw new Error(
                    `scaleGroups requires a resolved index or locus scale for ${channel}.`
                );
            }
            return {
                channel,
                extent: resolution.getFullExtentRef(),
                mapping: resolution.getMappingRef(),
            };
        });
    }

    get label() {
        return "scaleGroupsSource";
    }

    get domainSensitiveScaleChannels() {
        return this.params.channels;
    }

    activate() {
        if (this.#active) return;
        this.#active = true;
        this.registerDisposer(
            this.paramRuntime.effect(
                this.axes.flatMap((axis) => [axis.extent, axis.mapping]),
                () => {
                    if (this.#loaded) this.#publish(false);
                }
            )
        );
    }

    async load() {
        this.loadSynchronously();
    }

    loadSynchronously() {
        this.#loaded = true;
        this.#publish(true);
    }

    isDataReady() {
        return this.#ready && super.isDataReady();
    }

    /** @param {boolean} force */
    #publish(force) {
        const snapshot = this.axes.map((axis) => {
            const mapping = axis.mapping.get();
            if (!["index", "locus"].includes(mapping.scale.type)) {
                throw new Error("scaleGroups requires index or locus scales.");
            }
            return {
                ...axis.extent.get(),
                cuts: hasEffectiveGroupingGaps(mapping)
                    ? mapping.gapPositions
                    : [],
            };
        });
        if (!force && deepEqual(snapshot, this.#snapshot)) return;
        this.#snapshot = snapshot;
        this.#ready = snapshot.every((axis) => axis.ready);

        let rows = /** @type {Record<string, number>[]} */ ([{}]);
        if (this.#ready) {
            for (let i = 0; i < this.axes.length; i++) {
                const channel = this.axes[i].channel;
                const groups = splitScaleGroups(
                    snapshot[i].extent,
                    snapshot[i].cuts
                );
                rows = rows.flatMap((row) =>
                    groups.map(([start, end], group) => ({
                        ...row,
                        [channel + "Group"]: group,
                        [channel + "Start"]: start,
                        [channel + "End"]: end,
                    }))
                );
            }
        } else rows = [];

        this.reset();
        this.beginBatch({ type: "file" });
        for (const row of rows) this._propagate(row);
        this.complete();
        this.view.context.animator.requestRender();
    }
}

/** @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").ScaleGroupsData}
 */
function isScaleGroupsSource(params) {
    return params.type === "scaleGroups";
}
registerBuiltInLazyDataSource(isScaleGroupsSource, ScaleGroupsSource);
