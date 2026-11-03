/**
 * Trace the boundary of the native ribbon union, so overlapping dash caps do
 * not introduce internal contours when the boundary itself is stroked.
 * @param {number} length
 * @param {number} size
 * @param {"butt" | "square" | "round"} cap
 * @param {number[] | null} dash
 * @param {number} offset
 */
export function rulePath(length, size, cap, dash, offset) {
    if (dash?.some((value) => value < 0 || !Number.isFinite(value))) {
        throw new Error("Invalid stroke dash pattern: " + JSON.stringify(dash));
    }
    const radius = size / 2;
    /** @type {[number, number][]} */
    const intervals = [];
    /** @param {number} a @param {number} b */
    const append = (a, b) => {
        if (a === b && cap === "butt") return;
        if (cap === "square") {
            a -= radius;
            b += radius;
        }
        const previous = intervals.at(-1);
        if (previous && a <= previous[1])
            previous[1] = Math.max(previous[1], b);
        else intervals.push([a, b]);
    };
    const count = dash?.length ?? 0;
    const period =
        (dash?.reduce((sum, value) => sum + value, 0) ?? 0) *
        (count % 2 ? 2 : 1);
    if (period === 0) {
        append(0, length);
    } else {
        let start = -(((offset % period) + period) % period);
        for (let index = 0; start <= length; index++) {
            const end = start + dash[index % count];
            if (index % 2 === 0 && end >= 0)
                append(Math.max(0, start), Math.min(length, end));
            start = end;
        }
    }

    let path = "";
    const arc = (/** @type {number} */ x, /** @type {number} */ y) =>
        `A${radius} ${radius} 0 0 1 ${x} ${y}`;
    for (let first = 0; first < intervals.length;) {
        let last = first;
        if (cap === "round") {
            while (
                last + 1 < intervals.length &&
                intervals[last + 1][0] - intervals[last][1] < size
            )
                last++;
        }
        path += `M${intervals[first][0]} ${-radius}H${intervals[first][1]}`;
        // Equal-radius caps meet halfway between neighboring endpoints.
        for (let i = first; i < last; i++) {
            const right = intervals[i][1],
                left = intervals[i + 1][0];
            const x = (right + left) / 2;
            const y = Math.sqrt(
                Math.max(0, radius * radius - ((left - right) / 2) ** 2)
            );
            path += arc(x, -y) + arc(left, -radius) + `H${intervals[i + 1][1]}`;
        }
        if (cap === "round") path += arc(intervals[last][1], radius);
        else path += `V${radius}`;
        path += `H${intervals[last][0]}`;
        for (let i = last; i > first; i--) {
            const right = intervals[i - 1][1],
                left = intervals[i][0];
            const x = (right + left) / 2;
            const y = Math.sqrt(
                Math.max(0, radius * radius - ((left - right) / 2) ** 2)
            );
            path += arc(x, y) + arc(right, radius) + `H${intervals[i - 1][0]}`;
        }
        if (cap === "round") path += arc(intervals[first][0], -radius);
        path += "Z";
        first = last + 1;
    }
    return path;
}
