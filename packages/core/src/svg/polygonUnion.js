const EPSILON = 1e-8;

/** @typedef {{x: number, y: number}} Point */
/** @typedef {{a: Point, b: Point, polygonIndex: number}} Segment */

/**
 * Computes the boundary loops of a union of small simple polygons. This is
 * intentionally limited to the SVG arrow renderer's convex and concave head
 * and stem polygons; it avoids pulling a general clipping library into Core.
 *
 * @param {Point[][]} polygons
 * @returns {Point[][]}
 */
export function unionPolygons(polygons) {
    const edges = polygons.flatMap((polygon, polygonIndex) =>
        polygon.map((a, index) => ({
            a,
            b: polygon[(index + 1) % polygon.length],
            polygonIndex,
        }))
    );
    /** @type {Segment[]} */
    const boundary = [];

    for (const edge of edges) {
        const splits = [0, 1];
        for (const other of edges) {
            if (edge.polygonIndex != other.polygonIndex) {
                addIntersectionParameters(edge, other, splits);
            }
        }
        splits.sort((a, b) => a - b);

        for (let i = 0; i < splits.length - 1; i++) {
            const start = splits[i];
            const end = splits[i + 1];
            if (end - start <= EPSILON) {
                continue;
            }
            const a = interpolate(edge.a, edge.b, start);
            const b = interpolate(edge.a, edge.b, end);
            const midpoint = interpolate(a, b, 0.5);
            const covered = polygons.some(
                (polygon, polygonIndex) =>
                    polygonIndex != edge.polygonIndex &&
                    isStrictlyInside(midpoint, polygon)
            );
            if (!covered) {
                boundary.push({ a, b, polygonIndex: edge.polygonIndex });
            }
        }
    }

    return chainBoundarySegments(dedupeSegments(boundary));
}

/**
 * @param {Segment} edge
 * @param {Segment} other
 * @param {number[]} splits
 */
function addIntersectionParameters(edge, other, splits) {
    const r = subtract(edge.b, edge.a);
    const s = subtract(other.b, other.a);
    const offset = subtract(other.a, edge.a);
    const denominator = cross(r, s);

    if (Math.abs(denominator) > EPSILON) {
        const t = cross(offset, s) / denominator;
        const u = cross(offset, r) / denominator;
        if (
            t > EPSILON &&
            t < 1 - EPSILON &&
            u >= -EPSILON &&
            u <= 1 + EPSILON
        ) {
            splits.push(t);
        }
    } else if (Math.abs(cross(offset, r)) <= EPSILON) {
        addCollinearEndpoint(edge, other.a, splits);
        addCollinearEndpoint(edge, other.b, splits);
    }
}

/** @param {Segment} edge @param {Point} point @param {number[]} splits */
function addCollinearEndpoint(edge, point, splits) {
    const delta = subtract(edge.b, edge.a);
    const lengthSquared = dot(delta, delta);
    const t = dot(subtract(point, edge.a), delta) / lengthSquared;
    if (t > EPSILON && t < 1 - EPSILON) {
        splits.push(t);
    }
}

/** @param {Segment[]} segments */
function dedupeSegments(segments) {
    /** @type {Map<string, Segment>} */
    const unique = new Map();
    for (const segment of segments) {
        const forward = pointKey(segment.a) + ":" + pointKey(segment.b);
        const reverse = pointKey(segment.b) + ":" + pointKey(segment.a);
        if (unique.has(reverse)) {
            unique.delete(reverse);
        } else if (!unique.has(forward)) {
            unique.set(forward, segment);
        }
    }
    return Array.from(unique.values());
}

/** @param {Segment[]} segments */
function chainBoundarySegments(segments) {
    /** @type {Map<string, Segment[]>} */
    const byStart = new Map();
    for (const segment of segments) {
        const key = pointKey(segment.a);
        const candidates = byStart.get(key) ?? [];
        candidates.push(segment);
        byStart.set(key, candidates);
    }

    const unused = new Set(segments);
    /** @type {Point[][]} */
    const loops = [];
    while (unused.size) {
        const first = unused.values().next().value;
        /** @type {Point[]} */
        const loop = [first.a];
        let segment = first;
        while (true) {
            unused.delete(segment);
            loop.push(segment.b);
            if (pointKey(segment.b) == pointKey(loop[0])) {
                loop.pop();
                break;
            }
            const candidates = byStart.get(pointKey(segment.b)) ?? [];
            const next = candidates.find((candidate) => unused.has(candidate));
            if (!next) {
                throw new Error("Cannot chain SVG polygon union boundary.");
            }
            segment = next;
        }
        loops.push(loop);
    }
    return loops;
}

/** @param {Point} point @param {Point[]} polygon */
function isStrictlyInside(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j];
        const b = polygon[i];
        if (pointOnSegment(point, a, b)) {
            return false;
        }
        if (
            a.y > point.y != b.y > point.y &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
        ) {
            inside = !inside;
        }
    }
    return inside;
}

/** @param {Point} point @param {Point} a @param {Point} b */
function pointOnSegment(point, a, b) {
    return (
        Math.abs(cross(subtract(point, a), subtract(b, a))) <= EPSILON &&
        dot(subtract(point, a), subtract(point, b)) <= EPSILON
    );
}

/** @param {Point} a @param {Point} b @param {number} t */
function interpolate(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** @param {Point} point */
function pointKey(point) {
    return `${Math.round(point.x / EPSILON)},${Math.round(point.y / EPSILON)}`;
}

/** @param {Point} a @param {Point} b */
function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}

/** @param {Point} a @param {Point} b */
function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}

/** @param {Point} a @param {Point} b */
function cross(a, b) {
    return a.x * b.y - a.y * b.x;
}
