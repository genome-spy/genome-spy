/**
 * Compiles an even–odd containment test with a bounding-box fast path.
 * Boundaries are included within floating-point arithmetic error. Coordinates
 * must be finite numbers; invalid point coordinates never match. Captured edges
 * are independent of caller edits and polygon winding.
 *
 * @param {ReadonlyArray<readonly [number, number]>} polygon
 * @returns {(x: number, y: number) => boolean}
 */
export function createPolygonPredicate(polygon) {
    if (
        polygon.length < 3 ||
        polygon.some(
            (point) =>
                point.length !== 2 ||
                !Number.isFinite(point[0]) ||
                !Number.isFinite(point[1])
        )
    ) {
        throw new Error(
            "A region polygon requires at least three finite vertices."
        );
    }

    if (!hasNonCollinearVertices(polygon)) {
        throw new Error("A region polygon requires non-collinear vertices.");
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of polygon) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    // Fixed endpoint order gives both polygon windings the same arithmetic.
    const edges = polygon.map(([x1, y1], i) => {
        const [x2, y2] = polygon[(i + 1) % polygon.length];
        return y1 < y2 || (y1 === y2 && x1 < x2)
            ? [x1, y1, x2, y2]
            : [x2, y2, x1, y1];
    });

    return (x, y) => {
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            x < minX ||
            x > maxX ||
            y < minY ||
            y > maxY
        ) {
            return false;
        }

        let inside = false;
        for (const [x1, y1, x2, y2] of edges) {
            const a = (x - x1) * (y2 - y1);
            const b = (y - y1) * (x2 - x1);
            // Allow rounding from coordinate differences and determinant products.
            const error = 4 * Number.EPSILON * (Math.abs(a) + Math.abs(b));

            if (
                Math.abs(a - b) <= error &&
                x >= Math.min(x1, x2) &&
                x <= Math.max(x1, x2) &&
                y >= Math.min(y1, y2) &&
                y <= Math.max(y1, y2)
            ) {
                return true;
            }

            if (
                y1 <= y &&
                y < y2 &&
                x < x1 + ((y - y1) / (y2 - y1)) * (x2 - x1)
            ) {
                inside = !inside;
            }
        }
        return inside;
    };
}

/**
 * Signed area is insufficient: a self-crossing polygon may have zero area.
 * @param {ReadonlyArray<readonly [number, number]>} polygon
 */
export function hasNonCollinearVertices(polygon) {
    if (polygon.length < 3) return false;
    const [ax, ay] = polygon[0];
    const second = polygon.find(([x, y]) => x !== ax || y !== ay);
    return (
        !!second &&
        polygon.some(
            ([x, y]) =>
                (second[0] - ax) * (y - ay) !== (second[1] - ay) * (x - ax)
        )
    );
}
