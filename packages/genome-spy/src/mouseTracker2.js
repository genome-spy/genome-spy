import clientPoint from "./utils/point";

const defaultConverter = obj => Promise.resolve(obj);
const defaultEqTest = (a, b) => Object.is(a, b);

/**
 * A tool for tracking mouse movement and handling tooltips etc...
 *
 * @typedef {Object} ConstructorParams
 * @prop {HTMLElement} element element to observe
 * @prop {import("./view/view").default} viewRoot
 * @prop {function} resolver function that resolves an object based on its coordinates
 * @prop {import("./tooltip").default} [tooltip] tooltip
 * @prop {function} [tooltipConverter] function that converts the object to html for tooltip
 * @prop {function} [eqTest] function that tests whether two objects are equal
 *
 */
export default class MouseTracker2 {
    // 2 means "the second iteration"

    /**
     * @param {ConstructorParams} params parameters
     */
    constructor({
        element,
        viewRoot,
        resolver,
        tooltip,
        tooltipConverter = defaultConverter,
        eqTest = defaultEqTest
    }) {
        this.element = element;
        this.resolver = resolver;
        this.tooltip = tooltip;
        this.tooltipConverter = tooltipConverter;
        this.eqTest = eqTest;

        for (let type of [
            "mousemove",
            "mouseleave",
            "wheel",
            "click",
            "mousedown",
            "mouseup",
            "contextmenu"
        ]) {
            element.addEventListener(
                type,
                event =>
                    this._handleMouseEvent(/** @type {MouseEvent} */ (event)),
                false
            );
        }
    }

    /**
     * @param {MouseEvent} event
     */
    _handleMouseEvent(event) {
        const point = clientPoint(this.element, event);

        //console.log(point);
    }
}
