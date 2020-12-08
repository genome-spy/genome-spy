import { getFormat } from "./dataUtils";
import FlowNode from "../flowNode";

/**
 * @param {Partial<import("../../spec/data").Data>} data
 * @returns {data is import("../../spec/data").InlineData}
 */
export function isDynamicData(data) {
    return "dynamicSource" in data;
}

/**
 * @template H
 * @extends {FlowNode<H>}
 */
export default class DynamicSource extends FlowNode {
    /**
     * @param {import("../../spec/data").InlineData} params
     */
    constructor(params) {
        super();
    }

    /**
     *
     * @param {any} datum
     */
    handle(datum) {
        throw new Error("Source does not handle incoming data!");
    }

    loadSynchronously() {
        /** @type {any[]} */
        let data;

        if ("getDynamicData" in this.host) {
            data = this.host.getDynamicData();
        } else {
            throw new Error(
                "The host of DynamicSource does not have getDynamicData()!"
            );
        }

        this.reset();

        // TODO: Support streaming of iterables
        if (data.length) {
            const wrap =
                typeof data[0] != "object" ? x => ({ data: x }) : x => x;

            for (const d of data) {
                this._propagate(wrap(d));
            }
        }

        this.complete();
    }

    async load() {
        this.loadSynchronously();
    }
}
