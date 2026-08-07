// Intersections derived independently from two edges need a stable identity
// when the surviving pieces are chained back into loops.
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
    // Treat every polygon side as a directed edge. Arrow polygons use the same
    // winding direction, which lets the surviving directed pieces reconnect
    // into the outer union boundary without reorienting them.
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
        // Split the edge wherever another polygon crosses or overlaps it. Each
        // resulting piece is then wholly inside or wholly outside every other
        // polygon, so its midpoint is sufficient for classification.
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
            // Edges covered by another polygon are internal seams between an
            // arrowhead and the stem. Only uncovered pieces can contribute to
            // the visible fill/stroke outline.
            if (!covered) {
                boundary.push({ a, b, polygonIndex: edge.polygonIndex });
            }
        }
    }

    // Coincident pieces can survive midpoint classification because points on
    // a boundary are deliberately not considered inside. Cancel those pieces
    // before joining the remaining directed segments into closed SVG loops.
    return chainBoundarySegments(dedupeSegments(boundary));
}

/**
 * Adds the edge-local parameters of proper crossings and collinear overlap
 * endpoints. Splitting only the first edge is sufficient because every edge
 * is processed in turn as the first edge.
 *
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

/**
 * Removes identical directed segments and cancels coincident segments with
 * opposite directions, which bound an overlap rather than the union exterior.
 *
 * @param {Segment[]} segments
 */
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

/**
 * Joins directed boundary pieces by quantized endpoint identity. Disconnected
 * input shapes become separate loops and are later serialized as subpaths of
 * the same SVG path element.
 *
 * @param {Segment[]} segments
 */
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

/**
 * Uses an even-odd ray crossing test. Boundary points return false so a shared
 * edge is handled by segment deduplication rather than being discarded here.
 *
 * @param {Point} point
 * @param {Point[]} polygon
 */
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

/**
 * Quantizes a point only for topological identity; emitted SVG coordinates
 * retain the original full-precision intersection values.
 *
 * @param {Point} point
 */
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
