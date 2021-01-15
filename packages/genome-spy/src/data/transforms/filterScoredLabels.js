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

        this.channel = params.channel ?? "x";

        if (!["x", "y"].includes(this.channel)) {
            throw new Error("Invalid channel: " + this.channel);
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

        this.resolution = view.getScaleResolution(this.channel);

        // Synchronize propagation with rendering because we need both the domain and the range (length of the axis).
        const callback = () => this._filterAndPropagate();
        this.schedule = () => view.context.animator.requestTransition(callback);

        // Propagate when the domain changes
        this.resolution.addScaleObserver(scale => this.schedule());

        // Propagate when layout changes. Abusing a "private" method.
        // TODO: Provide another attachment point, in view context for example
        view._addBroadcastHandler("layoutComputed", () => this.schedule());

        // TODO: Remove observers when this FlowNode is thrown away.
    }

    complete() {
        const posAccessor = this.posAccessor;
        this._data.sort((a, b) => posAccessor(a) - posAccessor(b));

        this._scores = this._data.map(this.scoreAccessor);

        for (const lane of new Set(this._data.map(this.laneAccessor))) {
            this.reservationMaps.set(lane, new ReservationMap(200));
        }

        this.schedule();

        super.complete();
    }

    _filterAndPropagate() {
        super.reset();

        const scale = this.resolution.getScale();
        const rangeSpan = this.resolution.views[0].coords?.[
            this.channel == "x" ? "width" : "height"
        ];
        if (!rangeSpan) {
            // The view size is not (yet) available
            return;
        }

        for (const reservationMap of this.reservationMaps.values()) {
            reservationMap.reset();
        }

        const domain = scale.domain();
        const k = 70; // TODO: Configurable

        // Find the maximum of k elements from the visible domain in priority order
        const topIndices = topKSlice(
            this._scores,
            k,
            this.posBisector.left(this._data, domain[0]),
            this.posBisector.right(this._data, domain[1])
        );

        // Try to fit the elements on the available lanes and propagate if there was room
        for (const i of topIndices) {
            const datum = this._data[i];
            const pos = scale(this.posAccessor(datum)) * rangeSpan;
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
