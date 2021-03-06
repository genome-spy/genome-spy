/**
 * Adapted from: https://github.com/d3/d3-selection/blob/master/src/point.js
 *
 * @param {HTMLElement} node
 * @param {MouseEvent} event
 * @returns {[number, number]}
 */
export default function(node, event) {
    var rect = node.getBoundingClientRect();
    return [
        event.clientX - rect.left - node.clientLeft,
        event.clientY - rect.top - node.clientTop
    ];
}
