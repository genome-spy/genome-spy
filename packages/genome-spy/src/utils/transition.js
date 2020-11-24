import { scaleLinear } from "d3-scale";

/**
 *
 * TODO: Implement AbortController: https://developer.mozilla.org/en-US/docs/Web/API/AbortController
 *
 * @param {TransitionOptions} options
 *
 * @typedef {Object} TransitionOptions
 * @prop {number} [from]
 * @prop {number} [to]
 * @prop {number} [duration] in milliseconds
 * @prop {function(number):void} onUpdate
 * @prop {function(number):number} [easingFunction]
 * @prop {function(function(number):void):void} [requestAnimationFrame]
 */
export default function transition(options) {
    const requestAnimationFrame =
        options.requestAnimationFrame || window.requestAnimationFrame;

    return new Promise(resolve => {
        const beginTimestamp = performance.now();
        const endTimestamp = beginTimestamp + (options.duration || 1000);

        const from = typeof options.from == "number" ? options.from : 0;
        const to = typeof options.to == "number" ? options.to : 1;
        const ease = options.easingFunction || (x => x);

        const scale = scaleLinear()
            .domain([beginTimestamp, endTimestamp])
            .range([from, to])
            .clamp(true);

        /** @param {number} stamp */
        const step = stamp => {
            options.onUpdate(ease(scale(stamp)));

            if (stamp < endTimestamp) {
                requestAnimationFrame(step);
            } else {
                options.onUpdate(to);
                resolve();
            }
        };

        requestAnimationFrame(step);
    });
}
