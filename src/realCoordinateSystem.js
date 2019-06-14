import CoordinateSystem from "./coordinateSystem";
import Interval from "./utils/interval";

export default class RealCoordinateSystem extends CoordinateSystem {

    /**
     * 
     * @param {import("./utils/interval").default} interval 
     * @returns {string}
     */
    formatInterval(interval) {
        return "" + interval.lower + "-" + interval.upper;
    }

    /**
     * 
     * @param {string} str 
     * @returns {void | import("./utils/interval").default}
     */
    parseInterval(str) {
        const matches = str.match(/^(-?\d+)-(-?\d+)$/);
        if (matches) {
            return new Interval(parseInt(matches[1]), parseInt(matches[2]));
        }
        return null;
    }


    /**
     * If the coordinate system has a hard extent, return it. Otherwise returns undefined.
     * 
     * @returns {void | import("./utils/interval").default}
     */
    getExtent() { return new Interval(0, 10);}

}