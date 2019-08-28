import DiscreteDomain from "../utils/discreteDomain";

/**
 * @typedef { import("../utils/interval").default } Interval
 */

export default class Resolution {
    /**
     * @param {string} channel
     */
    constructor(channel) {
        this.channel = channel;
        /** @type {import("./unitView").default[]} */
        this.unitViews = [];
        this.scale = { }
        /** @type {string} */
        this.type = null;
    }

    /**
     * N.B. This is expected to be called in depth-first order
     * 
     * @param {import("./unitView").default} unitView 
     */
    pushUnitView(unitView) {
        const type = unitView.getEncoding()[this.channel].type;
        if (!this.type) {
            this.type = type;
        } else if (type !== this.type) {
            // TODO: Include a reference to the layer
            throw new Error(`Can not use shared scale for different data types: ${this.type} vs. ${type}. Use "resolve: independent" for channel ${this.channel}`)
            
        }

        this.unitViews.push(unitView);

        // TODO: Merge scale
    }

    getTitle() {
        return null; // TODO: Join titles
    }

    /**
     * @return { Interval | DiscreteDomain | void }
     */
    getDomain() {
        const domains = this.unitViews.map(view => view.getDomain(this.channel));
        if (domains.length === 1) {
            return domains[0];
        }

        switch (this.type) {
        case "quantitative":
            // TODO: What about piecewise domains?
            return (/** @type {Interval[]} */(domains)).reduce((prev, curr) => prev.span(curr));
        case "ordinal":
        case "nominal": {
            const domain = new DiscreteDomain();
            for (const d of domains) {
                domain.add(d);
            }
            return domain;
        }
        default:
            throw new Error(`Missing or unknown type on channel ${this.channel}`);
        }
    }

    getScale() {
        // TODO: Merge and build a scale
        throw new Error("TODO");
    }

}