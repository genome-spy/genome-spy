import { field } from "vega-util";
import { bisector } from "d3-array";
import FlowNode from "../flowNode";
import { topKSlice } from "../../utils/topk";
import ReservationMap from "../../utils/reservationMap";

/**
 * @typedef {import("../../spec/transform").FilterScoredLabelsParams} Params
 * @typedef {import("../../view/view").default} View
 */
export default class FilterScoredLabelsTransform extends FlowNode {
    /**
     *
     * @param {Params} params
     * @param {View} view
     */
    constructor(params, view) {
        super();

        this.params = params;

        /** @type {any[]} */
        this._data = [];

        const channel = params.channel ?? "x";

        if (!["x", "y"].includes(channel)) {
            throw new Error("Invalid channel: " + channel);
        }

        this.posAccessor = field(this.params.pos);
        this.posBisector = bisector(this.posAccessor);
        this.scoreAccessor = field(this.params.score);
        this.widthAccessor = field(this.params.width);
        /** @type {function(any):any} */
        this.laneAccessor = this.params.lane ? field(this.params.lane) : d => 0;
        this.padding = this.params.padding ?? 0;

        /** @type {Map<any, ReservationMap>} */
        this.reservationMaps = new Map();

        const resolution = view.getScaleResolution(channel);
        this.scale = resolution.getScale();

        resolution.addScaleObserver(scale => {
            const domain = /** @type {[number, number]} */ (scale.domain());
            this._filterAndPropagate(domain);
        });
    }

    complete() {
        const posAccessor = this.posAccessor;
        this._data.sort((a, b) => posAccessor(a) - posAccessor(b));

        this._scores = this._data.map(this.scoreAccessor);

        for (const lane of new Set(this._data.map(this.laneAccessor))) {
            this.reservationMaps.set(lane, new ReservationMap(200));
        }

        this._filterAndPropagate([-Infinity, Infinity]);

        super.complete();
    }

    /**
     *
     * @param {[number, number]} domain
     */
    _filterAndPropagate(domain) {
        super.reset();

        for (const reservationMap of this.reservationMaps.values()) {
            reservationMap.reset();
        }

        const k = 70; // TODO: Configurable
        const topIndices = topKSlice(
            this._scores,
            k,
            this.posBisector.left(this._data, domain[0]),
            this.posBisector.right(this._data, domain[1])
        );

        for (const i of topIndices) {
            const datum = this._data[i];
            // TODO: Need a range that represents pixels
            const pos = this.scale(this.posAccessor(datum)) * 1200;
            const halfWidth = this.widthAccessor(datum) / 2 + this.padding;

            if (
                this.reservationMaps
                    .get(this.laneAccessor(datum))
                    .reserve(pos - halfWidth, pos + halfWidth)
            ) {
                this._propagate(datum);
            }
        }

        super.complete();
    }

    reset() {
        super.reset();
        this._data = [];
        this.groups = new Map();
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        this._data.push(datum);
    }
}
