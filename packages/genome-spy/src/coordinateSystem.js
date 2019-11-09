export default class CoordinateSystem {
    /**
     * @param {import("../genomeSpy").default} genomeSpy
     */
    async initialize(genomeSpy) {}

    /**
     *
     * @param {import("./utils/interval").default} interval
     * @returns {string}
     */
    formatInterval(interval) {}

    /**
     *
     * @param {string} str
     * @returns {void | import("./utils/interval").default}
     */
    parseInterval(str) {}

    /**
     * If the coordinate system has a hard extent, return it. Otherwise returns undefined.
     *
     * @returns {import("./utils/interval").default}
     */
    getExtent() {
        return undefined;
    }
}
