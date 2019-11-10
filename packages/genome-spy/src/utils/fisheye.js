/**
 * Based on:
 * fisheye d3-plugin (c) Mike Bostock
 * https://github.com/d3/d3-plugins/blob/master/fisheye/
 */
export default function() {
    let radius = 200;
    let distortion = 2;
    let k0 = 1,
        k1 = 1;
    let focus = 0;

    /**
     *
     * @param {number} x
     */
    function fisheye(x) {
        const dx = x - focus;
        const dd = Math.abs(dx);
        if (!dd || dd >= radius) return x;
        const k = ((k0 * (1 - Math.exp(-dd * k1))) / dd) * 0.75 + 0.25;
        return focus + dx * k;
    }

    function rescale() {
        k0 = Math.exp(distortion);
        k0 = (k0 / (k0 - 1)) * radius;
        k1 = distortion / radius;
        return fisheye;
    }

    /**
     * @param {number} _
     */
    fisheye.radius = function(_) {
        if (!arguments.length) return radius;
        radius = +_;
        return rescale();
    };

    /**
     * @param {number} _
     */
    fisheye.distortion = function(_) {
        if (!arguments.length) return distortion;
        distortion = +_;
        return rescale();
    };

    /**
     * @param {number} _
     */
    fisheye.focus = function(_) {
        if (!arguments.length) return focus;
        focus = _;
        return fisheye;
    };

    return rescale();
}
