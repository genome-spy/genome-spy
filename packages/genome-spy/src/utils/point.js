// Adapted from: https://github.com/d3/d3-selection/blob/master/src/point.js
export default function (node, event) {
    var rect = node.getBoundingClientRect();
    return [event.clientX - rect.left - node.clientLeft, event.clientY - rect.top - node.clientTop];
}