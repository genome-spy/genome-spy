import { bisector } from "d3-array";
import { BEHAVIOR_COLLECTS } from "../flowNode.js";
import { topK } from "../../utils/topK.js";
import ReservationMap from "../../utils/reservationMap.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";

export default class FilterScoredLabelsTransform extends Transform {
    get behavior() {
        return BEHAVIOR_COLLECTS;
    }

    /**
     *
     * @param {import("../../spec/transform.js").FilterScoredLabelsParams} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        super(params);

        this.params = params;

        /** @type {any[]} */
        this._data = [];

        this.channel = params.channel ?? "x";

        if (!["x", "y"].includes(this.channel)) {
            throw new Error("Invalid channel: " + this.channel);
        }

        this.startPosAccessor = field(this.params.pos);
        this.endPosAccessor = field(this.params.pos2 ?? this.params.pos);
        this.startPosBisector = bisector(this.startPosAccessor);
        this.endPosBisector = bisector(this.endPosAccessor);
        this.scoreAccessor = field(this.params.score);
        this.widthAccessor = field(this.params.width);
        /** @type {function(any):any} */
        this.laneAccessor = this.params.lane
            ? field(this.params.lane)
            : (d) => 0;
        this.padding = this.params.padding ?? 0;

        /** @type {Map<any, ReservationMap>} */
        this.reservationMaps = new Map();

        this.resolution = view.getScaleResolution(this.channel);

        // Synchronize propagation with rendering because we need both the domain and the range (length of the axis).
        const callback = () => this._filterAndPropagate();
        this.schedule = () => view.context.animator.requestTransition(callback);

        // Propagate when the domain changes
        const domainListener = () => this.schedule();
        this.resolution.addEventListener("domain", domainListener);
        this.registerDisposer(() =>
            this.resolution.removeEventListener("domain", domainListener)
        );

        // Propagate when layout changes.
        const removeLayoutListener = view._addBroadcastHandler(
            "layoutComputed",
            () => this.schedule()
        );
        this.registerDisposer(removeLayoutListener);
    }

    complete() {
        const startPosAccessor = this.startPosAccessor;
        this._data.sort((a, b) => startPosAccessor(a) - startPosAccessor(b));

        for (const lane of new Set(this._data.map(this.laneAccessor))) {
            this.reservationMaps.set(lane, new ReservationMap(200));
        }

        this.schedule();

        super.complete();
    }

    _filterAndPropagate() {
        super.reset();

        const scale = this.resolution.getScale();
        const rangeSpan = this.resolution.getAxisLength();
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
        const topElements = topK(
            this._data,
            k,
            this.scoreAccessor,
            this.endPosBisector.left(this._data, domain[0]),
            this.startPosBisector.right(this._data, domain[1])
        );

        // Try to fit the elements on the available lanes and propagate if there was room
        for (const datum of topElements) {
            let startPos = scale(this.startPosAccessor(datum)) * rangeSpan;
            let endPos = scale(this.endPosAccessor(datum)) * rangeSpan;

            const span = endPos - startPos;
            const width = this.widthAccessor(datum) + this.padding * 2;

            let midpoint = (startPos + endPos) / 2;

            // How much extra space we have for adjusting the position so that the
            // text stays inside the range.
            const extra = Math.max(0.0, (span - width) / 2.0);
            if (extra > 0.0) {
                const leftOver = Math.max(0.0, width / 2 - midpoint);
                midpoint += Math.min(leftOver, extra);

                const rightOver = Math.max(
                    0.0,
                    width / 2 + midpoint - rangeSpan
                );
                midpoint -= Math.min(rightOver, extra);
            }

            if (
                this.reservationMaps
                    .get(this.laneAccessor(datum))
                    .reserve(midpoint - width / 2, midpoint + width / 2)
            ) {
                if (this.params.asMidpoint) {
                    // Clone the datum to avoid side effects
                    const clonedDatum = Object.assign({}, datum);
                    // @ts-ignore
                    clonedDatum[this.params.asMidpoint] = scale.invert(
                        midpoint / rangeSpan
                    );
                    this._propagate(clonedDatum);
                } else {
                    this._propagate(datum);
                }
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
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this._data.push(datum);
    }
}
