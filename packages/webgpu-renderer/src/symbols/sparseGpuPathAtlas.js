import { asGpuBufferSource } from "../utils/webgpuTextureUtils.js";
import { gpuLabel } from "../utils/gpuLabel.js";
import { buildSparsePathAtlasLayout } from "./sparsePathAtlasLayout.js";

// Independently implements the sparse edge-region algorithm described in:
// Chen et al., "Real-Time GPU Vector Graphics SDF Generation Based on
// Quadratic Stroke Rendering", SIGGRAPH 2026.
// https://doi.org/10.1145/3799902.3811177
// The authors' public prototype had no license when inspected, so none of its
// shader source is copied or translated here.

const EDGE_RASTER_SHADER = /* wgsl */ `
struct Segment {
    p0p1: vec4<f32>,
    p2pad: vec4<f32>,
    pseudoDomains: vec4<f32>,
    metadata: vec4<u32>,
};

struct Job {
    edgeRange: vec4<u32>,
    tileInfo: vec4<u32>,
};

struct Params {
    atlasSize: vec2<u32>,
    maxSlotSize: vec2<u32>,
    spread: f32,
    minDeviationRatio: f32,
    jobCount: u32,
    passMode: u32,
};

struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(flat) p0: vec2<f32>,
    @location(1) @interpolate(flat) p1: vec2<f32>,
    @location(2) @interpolate(flat) p2: vec2<f32>,
    @location(3) @interpolate(flat) kind: u32,
    @location(4) @interpolate(flat) colorMask: u32,
    @location(5) @interpolate(flat) pseudoMasks: u32,
    @location(6) @interpolate(flat) startPseudoDomain: vec2<f32>,
    @location(7) @interpolate(flat) endPseudoDomain: vec2<f32>,
};

@group(0) @binding(0) var<storage, read> segments: array<Segment>;
@group(0) @binding(1) var<storage, read> jobs: array<Job>;
@group(0) @binding(2) var<storage, read_write> scratch: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> trueScratch: array<atomic<u32>>;
@group(0) @binding(4) var<uniform> params: Params;

@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOut {
    let segment = segments[instanceIndex];
    let job = jobs[segment.metadata.z];
    let p0 = segment.p0p1.xy;
    let p1 = segment.p0p1.zw;
    let p2 = segment.p2pad.xy;
    let margin = vec2<f32>(params.spread + 1.0);
    let slotMin = vec2<f32>(job.edgeRange.zw);
    let slotMax = slotMin + vec2<f32>(job.tileInfo.xy);
    let boundsMin = max(floor(min(p0, min(p1, p2)) - margin), slotMin);
    let boundsMax = min(ceil(max(p0, max(p1, p2)) + margin), slotMax);
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0)
    );
    let pixel = mix(boundsMin, boundsMax, corners[vertexIndex]);
    let clip = vec2<f32>(
        pixel.x / f32(params.atlasSize.x) * 2.0 - 1.0,
        1.0 - pixel.y / f32(params.atlasSize.y) * 2.0
    );
    var out: VertexOut;
    out.position = vec4<f32>(clip, 0.0, 1.0);
    out.p0 = p0;
    out.p1 = p1;
    out.p2 = p2;
    out.kind = segment.metadata.x;
    out.colorMask = segment.metadata.y;
    out.pseudoMasks = segment.metadata.w;
    out.startPseudoDomain = segment.pseudoDomains.xy;
    out.endPseudoDomain = segment.pseudoDomains.zw;
    return out;
}

struct DistanceSample {
    magnitude: f32,
    t: f32,
};

fn lineDistance(
    point: vec2<f32>,
    p0: vec2<f32>,
    p1: vec2<f32>
) -> DistanceSample {
    let edge = p1 - p0;
    let denominator = dot(edge, edge);
    if (denominator <= 1e-12) {
        return DistanceSample(distance(point, p0), 0.0);
    }
    let t = clamp(dot(point - p0, edge) / denominator, 0.0, 1.0);
    return DistanceSample(distance(point, p0 + edge * t), t);
}

fn quadraticPoint(
    p0: vec2<f32>,
    p1: vec2<f32>,
    p2: vec2<f32>,
    t: f32
) -> vec2<f32> {
    return mix(mix(p0, p1, t), mix(p1, p2, t), t);
}

fn quadraticDistance(
    point: vec2<f32>,
    p0: vec2<f32>,
    p1: vec2<f32>,
    p2: vec2<f32>
) -> DistanceSample {
    var bestT = 0.0;
    var bestSquared = dot(point - p0, point - p0);
    for (var sample = 1u; sample <= 8u; sample++) {
        let t = f32(sample) / 8.0;
        let delta = point - quadraticPoint(p0, p1, p2, t);
        let squared = dot(delta, delta);
        if (squared < bestSquared) {
            bestSquared = squared;
            bestT = t;
        }
    }
    let secondDerivative = 2.0 * (p2 - 2.0 * p1 + p0);
    for (var iteration = 0u; iteration < 4u; iteration++) {
        let curve = quadraticPoint(p0, p1, p2, bestT);
        let derivative = 2.0 * (
            (1.0 - bestT) * (p1 - p0) + bestT * (p2 - p1)
        );
        let delta = curve - point;
        let numerator = dot(delta, derivative);
        let denominator = dot(derivative, derivative) +
            dot(delta, secondDerivative);
        if (abs(denominator) > 1e-8) {
            bestT = clamp(bestT - numerator / denominator, 0.0, 1.0);
        }
    }
    return DistanceSample(
        distance(point, quadraticPoint(p0, p1, p2, bestT)),
        bestT
    );
}

fn perpendicularDistance(
    point: vec2<f32>,
    endpoint: vec2<f32>,
    direction: vec2<f32>,
    fallback: f32
) -> f32 {
    let lengthSquared = dot(direction, direction);
    if (lengthSquared <= 1e-12) {
        return fallback;
    }
    let delta = point - endpoint;
    let perpendicular = abs(
        delta.x * direction.y - delta.y * direction.x
    ) / sqrt(lengthSquared);
    return min(fallback, perpendicular);
}

fn channelDistance(
    base: f32,
    channel: u32,
    startMask: u32,
    endMask: u32,
    startDistance: f32,
    endDistance: f32
) -> f32 {
    var value = base;
    if ((startMask & channel) != 0u) {
        value = min(value, startDistance);
    }
    if ((endMask & channel) != 0u) {
        value = min(value, endDistance);
    }
    return value;
}

fn candidatePriority(value: f32) -> u32 {
    let ordered = bitcast<u32>(value) & 0xfffffffeu;
    return 0xffffffffu - ordered;
}

fn priorityMagnitude(priority: u32) -> f32 {
    if (priority == 0u) {
        return 1e30;
    }
    return bitcast<f32>(0xffffffffu - priority);
}

fn isNearestTrueDistance(
    pixelIndex: u32,
    channelIndex: u32,
    value: f32
) -> bool {
    let nearest = priorityMagnitude(
        atomicLoad(&trueScratch[pixelIndex * 3u + channelIndex])
    );
    return value <= nearest + 1e-3;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    let point = in.position.xy;
    var sample = lineDistance(point, in.p0, in.p2);
    if (in.kind == 1u) {
        sample = quadraticDistance(point, in.p0, in.p1, in.p2);
    }
    if (!(sample.magnitude >= 0.0)) {
        discard;
    }
    let pixel = vec2<u32>(floor(point));
    let pixelIndex = pixel.y * params.atlasSize.x + pixel.x;
    if (params.passMode == 0u) {
        let priority = candidatePriority(sample.magnitude);
        if ((in.colorMask & 1u) != 0u) {
            atomicMax(&trueScratch[pixelIndex * 3u], priority);
        }
        if ((in.colorMask & 2u) != 0u) {
            atomicMax(&trueScratch[pixelIndex * 3u + 1u], priority);
        }
        if ((in.colorMask & 4u) != 0u) {
            atomicMax(&trueScratch[pixelIndex * 3u + 2u], priority);
        }
        return vec4<f32>(0.0);
    }
    var startDirection = in.p2 - in.p0;
    var endDirection = startDirection;
    if (in.kind == 1u) {
        startDirection = in.p1 - in.p0;
        endDirection = in.p2 - in.p1;
        if (dot(startDirection, startDirection) <= 1e-12) {
            startDirection = in.p2 - in.p0;
        }
        if (dot(endDirection, endDirection) <= 1e-12) {
            endDirection = in.p2 - in.p0;
        }
    }
    var startDistance = sample.magnitude;
    if (
        sample.t <= 1e-5 &&
        dot(point - in.p0, startDirection) < 0.0
    ) {
        let candidate = perpendicularDistance(
            point,
            in.p0,
            startDirection,
            sample.magnitude
        );
        // Include the bisector itself so symmetric corners do not retain a
        // one-pixel radial seam.
        if (dot(point - in.p0, in.startPseudoDomain) >= 0.0) {
            startDistance = candidate;
        }
    }
    var endDistance = sample.magnitude;
    if (
        sample.t >= 1.0 - 1e-5 &&
        dot(point - in.p2, endDirection) > 0.0
    ) {
        let candidate = perpendicularDistance(
            point,
            in.p2,
            endDirection,
            sample.magnitude
        );
        if (dot(point - in.p2, in.endPseudoDomain) <= 0.0) {
            endDistance = candidate;
        }
    }
    let startMask = in.pseudoMasks & 7u;
    let endMask = (in.pseudoMasks >> 3u) & 7u;
    let redDistance = channelDistance(
        sample.magnitude,
        1u,
        startMask,
        endMask,
        startDistance,
        endDistance
    );
    let greenDistance = channelDistance(
        sample.magnitude,
        2u,
        startMask,
        endMask,
        startDistance,
        endDistance
    );
    let blueDistance = channelDistance(
        sample.magnitude,
        4u,
        startMask,
        endMask,
        startDistance,
        endDistance
    );
    if ((in.colorMask & 1u) != 0u && redDistance < sample.magnitude) {
        if (
            redDistance <= params.spread &&
            isNearestTrueDistance(pixelIndex, 0u, sample.magnitude)
        ) {
            atomicMax(
                &scratch[pixelIndex * 3u],
                candidatePriority(redDistance)
            );
        }
    }
    if ((in.colorMask & 2u) != 0u && greenDistance < sample.magnitude) {
        if (
            greenDistance <= params.spread &&
            isNearestTrueDistance(pixelIndex, 1u, sample.magnitude)
        ) {
            atomicMax(
                &scratch[pixelIndex * 3u + 1u],
                candidatePriority(greenDistance)
            );
        }
    }
    if ((in.colorMask & 4u) != 0u && blueDistance < sample.magnitude) {
        if (
            blueDistance <= params.spread &&
            isNearestTrueDistance(pixelIndex, 2u, sample.magnitude)
        ) {
            atomicMax(
                &scratch[pixelIndex * 3u + 2u],
                candidatePriority(blueDistance)
            );
        }
    }
    return vec4<f32>(0.0);
}
`;

const RAW_DISTANCE_SHADER = /* wgsl */ `
struct Segment {
    p0p1: vec4<f32>,
    p2pad: vec4<f32>,
    pseudoDomains: vec4<f32>,
    metadata: vec4<u32>,
};

struct Job {
    edgeRange: vec4<u32>,
    tileInfo: vec4<u32>,
};

struct Params {
    atlasSize: vec2<u32>,
    maxSlotSize: vec2<u32>,
    spread: f32,
    minDeviationRatio: f32,
    jobCount: u32,
    passMode: u32,
};

@group(0) @binding(0) var<storage, read> segments: array<Segment>;
@group(0) @binding(1) var<storage, read> jobs: array<Job>;
@group(0) @binding(2) var<storage, read_write> scratch: array<atomic<u32>>;
@group(0) @binding(3) var rawOutput: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<uniform> params: Params;

fn quadraticPoint(
    p0: vec2<f32>,
    p1: vec2<f32>,
    p2: vec2<f32>,
    t: f32
) -> vec2<f32> {
    return mix(mix(p0, p1, t), mix(p1, p2, t), t);
}

fn lineCrossesRay(point: vec2<f32>, p0: vec2<f32>, p1: vec2<f32>) -> bool {
    let straddles = (p0.y <= point.y && point.y < p1.y) ||
        (p1.y <= point.y && point.y < p0.y);
    if (!straddles) {
        return false;
    }
    let x = p0.x + (point.y - p0.y) * (p1.x - p0.x) / (p1.y - p0.y);
    return x > point.x;
}

// Apply the same lower-inclusive, upper-exclusive endpoint rule as line
// crossings. Whole quadratic roots cannot apply this rule consistently at a
// shared extremum and can leave a one-pixel sign streak across the tile.
fn monotonicQuadraticCrossesRay(
    point: vec2<f32>,
    p0: vec2<f32>,
    p1: vec2<f32>,
    p2: vec2<f32>
) -> bool {
    let straddles = (p0.y <= point.y && point.y < p2.y) ||
        (p2.y <= point.y && point.y < p0.y);
    if (!straddles) {
        return false;
    }
    let a = p0.y - 2.0 * p1.y + p2.y;
    let b = 2.0 * (p1.y - p0.y);
    let c = p0.y - point.y;
    var t = 0.0;
    if (abs(a) <= 1e-6) {
        if (abs(b) <= 1e-6) {
            return false;
        }
        t = -c / b;
    } else {
        let discriminant = max(b * b - 4.0 * a * c, 0.0);
        let root = sqrt(discriminant);
        let first = (-b - root) / (2.0 * a);
        let second = (-b + root) / (2.0 * a);
        t = select(second, first, first >= -1e-5 && first <= 1.0 + 1e-5);
    }
    return quadraticPoint(p0, p1, p2, clamp(t, 0.0, 1.0)).x > point.x;
}

fn quadraticCrossingParity(
    point: vec2<f32>,
    p0: vec2<f32>,
    p1: vec2<f32>,
    p2: vec2<f32>
) -> bool {
    let denominator = p0.y - 2.0 * p1.y + p2.y;
    if (abs(denominator) <= 1e-6) {
        return monotonicQuadraticCrossesRay(point, p0, p1, p2);
    }
    let extremum = (p0.y - p1.y) / denominator;
    if (extremum <= 1e-5 || extremum >= 1.0 - 1e-5) {
        return monotonicQuadraticCrossesRay(point, p0, p1, p2);
    }
    let p01 = mix(p0, p1, extremum);
    let p12 = mix(p1, p2, extremum);
    let split = mix(p01, p12, extremum);
    return monotonicQuadraticCrossesRay(point, p0, p01, split) !=
        monotonicQuadraticCrossesRay(point, split, p12, p2);
}

fn decodeMagnitude(priority: u32) -> f32 {
    if (priority == 0u) {
        return params.spread;
    }
    let ordered = 0xffffffffu - priority;
    return min(bitcast<f32>(ordered), params.spread);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.z >= params.jobCount) {
        return;
    }
    let job = jobs[gid.z];
    if (gid.x >= job.tileInfo.x || gid.y >= job.tileInfo.y) {
        return;
    }
    let pixel = job.edgeRange.zw + gid.xy;
    let point = vec2<f32>(pixel) + vec2<f32>(0.5);
    var inside = false;
    let edgeEnd = job.edgeRange.x + job.edgeRange.y;
    for (var edgeIndex = job.edgeRange.x; edgeIndex < edgeEnd; edgeIndex++) {
        let segment = segments[edgeIndex];
        let p0 = segment.p0p1.xy;
        let p1 = segment.p0p1.zw;
        let p2 = segment.p2pad.xy;
        var crosses = lineCrossesRay(point, p0, p2);
        if (segment.metadata.x == 1u) {
            crosses = quadraticCrossingParity(point, p0, p1, p2);
        }
        if (crosses) {
            inside = !inside;
        }
    }
    let pixelIndex = pixel.y * params.atlasSize.x + pixel.x;
    let sign = select(-1.0, 1.0, inside);
    let unsignedValue = vec3<f32>(
        decodeMagnitude(atomicLoad(&scratch[pixelIndex * 3u])),
        decodeMagnitude(atomicLoad(&scratch[pixelIndex * 3u + 1u])),
        decodeMagnitude(atomicLoad(&scratch[pixelIndex * 3u + 2u]))
    );
    let value = unsignedValue * sign;
    // Preserve a regular signed distance beside the colored distances. Wide,
    // soft effects need the nearest edge regardless of its MSDF color.
    let trueDistance = min(
        unsignedValue.r,
        min(unsignedValue.g, unsignedValue.b)
    ) * sign;
    textureStore(
        rawOutput,
        vec2<i32>(pixel),
        vec4<f32>(value, trueDistance)
    );
}
`;

const CORRECTION_SHADER = /* wgsl */ `
struct Job {
    edgeRange: vec4<u32>,
    tileInfo: vec4<u32>,
};

struct Params {
    atlasSize: vec2<u32>,
    maxSlotSize: vec2<u32>,
    spread: f32,
    minDeviationRatio: f32,
    jobCount: u32,
    passMode: u32,
};

@group(0) @binding(0) var rawInput: texture_2d<f32>;
@group(0) @binding(1) var finalOutput: texture_storage_2d<OUTPUT_FORMAT, write>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> jobs: array<Job>;

fn median3(value: vec3<f32>) -> f32 {
    return max(min(value.r, value.g), min(max(value.r, value.g), value.b));
}

fn interpolatedMedian(a: vec3<f32>, b: vec3<f32>, t: f32) -> f32 {
    return median3(mix(a, b, t));
}

// This is the unprotected linear-neighbor subset of msdfgen's interpolation
// artifact classifier. The focused regression matrix guards the sharp corners
// that canonical msdfgen protects with a separate stencil.
fn isInterpolationArtifact(
    a: vec3<f32>,
    b: vec3<f32>,
    am: f32,
    bm: f32,
    firstChannel: u32,
    secondChannel: u32,
    span: f32
) -> bool {
    let differenceA = a[firstChannel] - a[secondChannel];
    let differenceB = b[firstChannel] - b[secondChannel];
    let denominator = differenceA - differenceB;
    if (abs(denominator) <= 1e-6) {
        return false;
    }
    let t = differenceA / denominator;
    if (t <= 0.01 || t >= 0.99) {
        return false;
    }
    let interpolated = interpolatedMedian(a, b, t);
    let invertsInside = am > 0.0 && bm > 0.0 && interpolated <= 0.0;
    let invertsOutside = am < 0.0 && bm < 0.0 && interpolated >= 0.0;
    let leavesEndpointRange =
        interpolated < min(am, bm) || interpolated > max(am, bm);
    if (!invertsInside && !invertsOutside && !leavesEndpointRange) {
        return false;
    }
    let distanceFromA = t * span;
    let distanceFromB = (1.0 - t) * span;
    let withinExpectedRange =
        interpolated >= am - distanceFromA &&
        interpolated <= am + distanceFromA &&
        interpolated >= bm - distanceFromB &&
        interpolated <= bm + distanceFromB;
    return !withinExpectedRange;
}

fn hasLinearArtifact(a: vec3<f32>, b: vec3<f32>) -> bool {
    let am = median3(a);
    let bm = median3(b);
    // Correct only the texel farther from the contour to minimize collateral
    // changes to edge and corner reconstruction.
    if (abs(am) < abs(bm)) {
        return false;
    }
    let span = params.minDeviationRatio;
    return
        isInterpolationArtifact(a, b, am, bm, 0u, 1u, span) ||
        isInterpolationArtifact(a, b, am, bm, 1u, 2u, span) ||
        isInterpolationArtifact(a, b, am, bm, 2u, 0u, span);
}

fn diagonalRootIsArtifact(
    a: vec3<f32>,
    linear: vec3<f32>,
    quadratic: vec3<f32>,
    am: f32,
    dm: f32,
    t: f32
) -> bool {
    if (t <= 0.01 || t >= 0.99) {
        return false;
    }
    let interpolated = median3(a + t * linear + t * t * quadratic);
    let invertsInside = am > 0.0 && dm > 0.0 && interpolated <= 0.0;
    let invertsOutside = am < 0.0 && dm < 0.0 && interpolated >= 0.0;
    if (!invertsInside && !invertsOutside) {
        return false;
    }
    let span = params.minDeviationRatio * sqrt(2.0);
    let distanceFromA = t * span;
    let distanceFromD = (1.0 - t) * span;
    let withinExpectedRange =
        interpolated >= am - distanceFromA &&
        interpolated <= am + distanceFromA &&
        interpolated >= dm - distanceFromD &&
        interpolated <= dm + distanceFromD;
    return !withinExpectedRange;
}

fn diagonalChannelPairHasArtifact(
    a: vec3<f32>,
    linear: vec3<f32>,
    quadratic: vec3<f32>,
    am: f32,
    dm: f32,
    firstChannel: u32,
    secondChannel: u32
) -> bool {
    let constant = a[firstChannel] - a[secondChannel];
    let linearCoefficient =
        linear[firstChannel] - linear[secondChannel];
    let quadraticCoefficient =
        quadratic[firstChannel] - quadratic[secondChannel];
    if (abs(quadraticCoefficient) <= 1e-6) {
        if (abs(linearCoefficient) <= 1e-6) {
            return false;
        }
        return diagonalRootIsArtifact(
            a,
            linear,
            quadratic,
            am,
            dm,
            -constant / linearCoefficient
        );
    }
    let discriminant =
        linearCoefficient * linearCoefficient -
        4.0 * quadraticCoefficient * constant;
    if (discriminant < 0.0) {
        return false;
    }
    let rootOffset = sqrt(discriminant);
    let denominator = 2.0 * quadraticCoefficient;
    return
        diagonalRootIsArtifact(
            a,
            linear,
            quadratic,
            am,
            dm,
            (-linearCoefficient - rootOffset) / denominator
        ) ||
        diagonalRootIsArtifact(
            a,
            linear,
            quadratic,
            am,
            dm,
            (-linearCoefficient + rootOffset) / denominator
        );
}

// This is the inversion-only part of msdfgen's diagonal bilinear classifier.
// It removes false inside/outside crossings without applying the broader
// unprotected correction that can erase legitimate acute tips.
fn hasDiagonalArtifact(
    a: vec3<f32>,
    b: vec3<f32>,
    c: vec3<f32>,
    d: vec3<f32>
) -> bool {
    let am = median3(a);
    let dm = median3(d);
    if (abs(am) < abs(dm)) {
        return false;
    }
    let abc = a - b - c;
    let linear = -a - abc;
    let quadratic = d + abc;
    return
        diagonalChannelPairHasArtifact(
            a, linear, quadratic, am, dm, 0u, 1u
        ) ||
        diagonalChannelPairHasArtifact(
            a, linear, quadratic, am, dm, 1u, 2u
        ) ||
        diagonalChannelPairHasArtifact(
            a, linear, quadratic, am, dm, 2u, 0u
        );
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.z >= params.jobCount) {
        return;
    }
    let job = jobs[gid.z];
    if (gid.x >= job.tileInfo.x || gid.y >= job.tileInfo.y) {
        return;
    }
    let slotMin = vec2<i32>(job.edgeRange.zw);
    let slotMax = slotMin + vec2<i32>(job.tileInfo.xy);
    let coordinate = slotMin + vec2<i32>(gid.xy);
    let rawValue = textureLoad(rawInput, coordinate, 0);
    var value = rawValue.rgb;
    let trueDistance = rawValue.a;
    let offsets = array<vec2<i32>, 4>(
        vec2<i32>(-1, 0),
        vec2<i32>(1, 0),
        vec2<i32>(0, -1),
        vec2<i32>(0, 1)
    );
    var needsCorrection = false;
    for (var index = 0u; index < 4u; index++) {
        let neighbor = coordinate + offsets[index];
        if (
            neighbor.x < slotMin.x ||
            neighbor.y < slotMin.y ||
            neighbor.x >= slotMax.x ||
            neighbor.y >= slotMax.y
        ) {
            continue;
        }
        let neighborValue = textureLoad(rawInput, neighbor, 0).rgb;
        if (hasLinearArtifact(value, neighborValue)) {
            needsCorrection = true;
            break;
        }
    }
    let diagonalOffsets = array<vec2<i32>, 4>(
        vec2<i32>(-1, -1),
        vec2<i32>(1, -1),
        vec2<i32>(-1, 1),
        vec2<i32>(1, 1)
    );
    for (var index = 0u; index < 4u && !needsCorrection; index++) {
        let diagonalOffset = diagonalOffsets[index];
        let horizontal = coordinate + vec2<i32>(diagonalOffset.x, 0);
        let vertical = coordinate + vec2<i32>(0, diagonalOffset.y);
        let diagonal = coordinate + diagonalOffset;
        if (
            diagonal.x < slotMin.x ||
            diagonal.y < slotMin.y ||
            diagonal.x >= slotMax.x ||
            diagonal.y >= slotMax.y
        ) {
            continue;
        }
        let horizontalValue = textureLoad(rawInput, horizontal, 0).rgb;
        let verticalValue = textureLoad(rawInput, vertical, 0).rgb;
        let diagonalValue = textureLoad(rawInput, diagonal, 0).rgb;
        if (
            hasDiagonalArtifact(
                value,
                horizontalValue,
                verticalValue,
                diagonalValue
            )
        ) {
            needsCorrection = true;
        }
    }
    if (needsCorrection) {
        value = vec3<f32>(median3(value));
    }
    OUTPUT_STORE
}
`;

const RGBA8_STORE = /* wgsl */ `
let mapped = clamp(
        vec4<f32>(0.5) + vec4<f32>(value, trueDistance) /
            (2.0 * params.spread),
        vec4<f32>(0.0),
        vec4<f32>(1.0)
    );
    textureStore(finalOutput, coordinate, mapped);`;

const RGBA16_FLOAT_STORE = /* wgsl */ `
textureStore(finalOutput, coordinate, vec4<f32>(value, trueDistance));`;

/**
 * @param {"rgba8unorm" | "rgba16float"} format
 */
function createCorrectionShader(format) {
    const outputStore =
        format === "rgba8unorm" ? RGBA8_STORE : RGBA16_FLOAT_STORE;
    return CORRECTION_SHADER.replace("OUTPUT_FORMAT", format).replace(
        "OUTPUT_STORE",
        outputStore
    );
}

const pipelineCache = new WeakMap();

/**
 * @param {GPUDevice} device
 * @param {"rgba8unorm" | "rgba16float"} format
 */
function getPipelines(device, format) {
    let devicePipelines = pipelineCache.get(device);
    if (!devicePipelines) {
        const edgeModule = device.createShaderModule({
            label: "sparse path edge raster shader",
            code: EDGE_RASTER_SHADER,
        });
        const rawModule = device.createShaderModule({
            label: "sparse path raw distance shader",
            code: RAW_DISTANCE_SHADER,
        });
        devicePipelines = {
            edgeModule,
            raw: device.createComputePipeline({
                label: "sparse path raw distance pipeline",
                layout: "auto",
                compute: { module: rawModule, entryPoint: "main" },
            }),
            formats: new Map(),
        };
        pipelineCache.set(device, devicePipelines);
    }

    let pipelines = devicePipelines.formats.get(format);
    if (!pipelines) {
        const correctionModule = device.createShaderModule({
            label: `sparse path ${format} correction shader`,
            code: createCorrectionShader(format),
        });
        pipelines = {
            edge: device.createRenderPipeline({
                label: `sparse path ${format} edge raster pipeline`,
                layout: "auto",
                vertex: {
                    module: devicePipelines.edgeModule,
                    entryPoint: "vs_main",
                },
                fragment: {
                    module: devicePipelines.edgeModule,
                    entryPoint: "fs_main",
                    targets: [{ format }],
                },
                primitive: { topology: "triangle-list" },
            }),
            raw: devicePipelines.raw,
            correction: device.createComputePipeline({
                label: `sparse path ${format} correction pipeline`,
                layout: "auto",
                compute: { module: correctionModule, entryPoint: "main" },
            }),
        };
        devicePipelines.formats.set(format, pipelines);
    }
    return pipelines;
}

/**
 * @param {ReturnType<typeof buildSparsePathAtlasLayout>} layout
 * @param {number} passMode
 */
function createParams(layout, passMode) {
    const data = new ArrayBuffer(32);
    const view = new DataView(data);
    view.setUint32(0, layout.width, true);
    view.setUint32(4, layout.height, true);
    view.setUint32(8, layout.maxSlotWidth, true);
    view.setUint32(12, layout.maxSlotHeight, true);
    view.setFloat32(16, layout.spread, true);
    view.setFloat32(20, 1.1111112, true);
    view.setUint32(24, layout.uniquePathCount, true);
    view.setUint32(28, passMode, true);
    return data;
}

const BYTES_PER_SCRATCH_PIXEL = 3 * 4 * 2 + 4 * 2;
const DEFAULT_MAX_SCRATCH_BYTES = 64 * 1024 * 1024;

/** @param {number} value */
function alignToFour(value) {
    return Math.max(4, Math.ceil(value / 4) * 4);
}

/**
 * @param {string[]} paths
 * @param {{ tileSize?: number, spread?: number, shapePadding?: number, gutter?: number, cubicTolerance?: number, normalizationSpan?: number, tightPacking?: boolean, maxAtlasWidth?: number, format?: "rgba8unorm" | "rgba16float" }} options
 */
function atlasCacheKey(paths, options) {
    return JSON.stringify([
        paths,
        options.tileSize ?? null,
        options.spread ?? null,
        options.shapePadding ?? null,
        options.gutter ?? null,
        options.cubicTolerance ?? null,
        options.normalizationSpan ?? null,
        options.tightPacking ?? false,
        options.maxAtlasWidth ?? null,
        options.format ?? "rgba8unorm",
    ]);
}

/**
 * Reusable, device-owned resources for GPU MSDF generation.
 */
export class MsdfAtlasGenerator {
    /**
     * @param {GPUDevice} device
     * @param {{ maxScratchBytes?: number }} [options]
     */
    constructor(device, options = {}) {
        this.device = device;
        this.maxScratchBytes =
            options.maxScratchBytes ?? DEFAULT_MAX_SCRATCH_BYTES;
        if (
            !Number.isSafeInteger(this.maxScratchBytes) ||
            this.maxScratchBytes < BYTES_PER_SCRATCH_PIXEL
        ) {
            throw new Error("MSDF scratch limit must be a positive integer.");
        }

        this._destroyed = false;
        this._width = 0;
        this._height = 0;
        this._segmentCapacity = 0;
        this._jobCapacity = 0;
        /** @type {GPUBuffer | null} */
        this._segmentBuffer = null;
        /** @type {GPUBuffer | null} */
        this._jobBuffer = null;
        /** @type {GPUBuffer | null} */
        this._trueParamsBuffer = null;
        /** @type {GPUBuffer | null} */
        this._pseudoParamsBuffer = null;
        /** @type {GPUBuffer | null} */
        this._scratchBuffer = null;
        /** @type {GPUBuffer | null} */
        this._trueScratchBuffer = null;
        /** @type {GPUTexture | null} */
        this._rawTexture = null;
        /** @type {Set<Promise<void>>} */
        this._retirements = new Set();
        /** @type {Map<string, ReturnType<MsdfAtlasGenerator["createAtlas"]>>} */
        this._atlasCache = new Map();
    }

    /** @param {GPUBuffer | GPUTexture | null} resource */
    _retire(resource) {
        if (!resource) {
            return;
        }
        const retirement = this.device.queue.onSubmittedWorkDone().then(
            () => resource.destroy(),
            () => resource.destroy()
        );
        this._retirements.add(retirement);
        void retirement.finally(() => this._retirements.delete(retirement));
    }

    /**
     * @param {number} required
     * @param {number} capacity
     */
    _nextCapacity(required, capacity) {
        let next = Math.max(4, capacity);
        while (next < required) {
            next *= 2;
        }
        return next;
    }

    /**
     * @param {number} required
     * @param {"segments" | "jobs"} kind
     */
    _ensureInputBuffer(required, kind) {
        const capacityProperty =
            kind === "segments" ? "_segmentCapacity" : "_jobCapacity";
        const bufferProperty =
            kind === "segments" ? "_segmentBuffer" : "_jobBuffer";
        if (required <= this[capacityProperty]) {
            return;
        }
        const capacity = this._nextCapacity(
            alignToFour(required),
            this[capacityProperty]
        );
        const maxBindingSize =
            this.device.limits.maxStorageBufferBindingSize ?? Infinity;
        if (capacity > maxBindingSize) {
            throw new Error(`MSDF ${kind} exceed the device buffer limit.`);
        }
        const oldBuffer = this[bufferProperty];
        this[bufferProperty] = this.device.createBuffer({
            label: `MSDF reusable ${kind}`,
            size: capacity,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this[capacityProperty] = capacity;
        this._retire(oldBuffer);
    }

    /** @param {number} width @param {number} height */
    _ensureScratch(width, height) {
        const nextWidth = Math.max(width, this._width);
        const nextHeight = Math.max(height, this._height);
        if (nextWidth === this._width && nextHeight === this._height) {
            return;
        }
        const maxDimension = this.device.limits.maxTextureDimension2D;
        const pixels = nextWidth * nextHeight;
        const scratchBytes = pixels * BYTES_PER_SCRATCH_PIXEL;
        const atomicBytes = pixels * 3 * 4;
        const maxBindingSize =
            this.device.limits.maxStorageBufferBindingSize ?? Infinity;
        if (
            nextWidth > maxDimension ||
            nextHeight > maxDimension ||
            scratchBytes > this.maxScratchBytes ||
            atomicBytes > maxBindingSize
        ) {
            throw new Error(
                `MSDF generation needs ${scratchBytes} scratch bytes, exceeding its configured or device limit.`
            );
        }

        const oldScratch = this._scratchBuffer;
        const oldTrueScratch = this._trueScratchBuffer;
        const oldRawTexture = this._rawTexture;
        this._scratchBuffer = this.device.createBuffer({
            label: "MSDF reusable atomic scratch",
            size: atomicBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this._trueScratchBuffer = this.device.createBuffer({
            label: "MSDF reusable true-distance scratch",
            size: atomicBytes,
            usage:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.COPY_SRC |
                GPUBufferUsage.COPY_DST,
        });
        this._rawTexture = this.device.createTexture({
            label: "MSDF reusable raw distances",
            size: [nextWidth, nextHeight],
            format: "rgba16float",
            usage:
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING,
        });
        this._width = nextWidth;
        this._height = nextHeight;
        this._retire(oldScratch);
        this._retire(oldTrueScratch);
        this._retire(oldRawTexture);
    }

    _ensureParams() {
        if (this._trueParamsBuffer) {
            return;
        }
        this._trueParamsBuffer = this.device.createBuffer({
            label: "MSDF true-distance parameters",
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._pseudoParamsBuffer = this.device.createBuffer({
            label: "MSDF pseudo-distance parameters",
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Generate an immutable RGB MSDF path atlas.
     *
     * Calls are serialized by WebGPU queue ordering, so reusable inputs and
     * scratch can be overwritten immediately after each submission.
     *
     * @param {string[]} paths
     * @param {{ tileSize?: number, spread?: number, shapePadding?: number, gutter?: number, cubicTolerance?: number, normalizationSpan?: number, tightPacking?: boolean, maxAtlasWidth?: number, format?: "rgba8unorm" | "rgba16float" }} [options]
     * @param {string} [label]
     */
    createAtlas(paths, options = {}, label = "path atlas") {
        if (this._destroyed) {
            throw new Error("MSDF atlas generator has been destroyed.");
        }
        const layout = buildSparsePathAtlasLayout(paths, options);
        const format = options.format ?? "rgba8unorm";
        if (format !== "rgba8unorm" && format !== "rgba16float") {
            throw new Error("Unsupported sparse path atlas texture format.");
        }
        this._ensureInputBuffer(layout.segmentData.byteLength, "segments");
        this._ensureInputBuffer(layout.jobData.byteLength, "jobs");
        this._ensureScratch(layout.width, layout.height);
        this._ensureParams();

        const segmentBuffer = /** @type {GPUBuffer} */ (this._segmentBuffer);
        const jobBuffer = /** @type {GPUBuffer} */ (this._jobBuffer);
        const trueParamsBuffer = /** @type {GPUBuffer} */ (
            this._trueParamsBuffer
        );
        const pseudoParamsBuffer = /** @type {GPUBuffer} */ (
            this._pseudoParamsBuffer
        );
        const scratchBuffer = /** @type {GPUBuffer} */ (this._scratchBuffer);
        const trueScratchBuffer = /** @type {GPUBuffer} */ (
            this._trueScratchBuffer
        );
        const rawTexture = /** @type {GPUTexture} */ (this._rawTexture);
        const pipelines = getPipelines(this.device, format);
        this.device.queue.writeBuffer(
            segmentBuffer,
            0,
            asGpuBufferSource(new Uint8Array(layout.segmentData))
        );
        this.device.queue.writeBuffer(
            jobBuffer,
            0,
            asGpuBufferSource(new Uint8Array(layout.jobData))
        );
        this.device.queue.writeBuffer(
            trueParamsBuffer,
            0,
            asGpuBufferSource(new Uint8Array(createParams(layout, 0)))
        );
        this.device.queue.writeBuffer(
            pseudoParamsBuffer,
            0,
            asGpuBufferSource(new Uint8Array(createParams(layout, 1)))
        );

        const texture = this.device.createTexture({
            label,
            size: [layout.width, layout.height],
            format,
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC,
        });
        const entryBuffer = this.device.createBuffer({
            label: gpuLabel(label, "entries"),
            size: layout.entries.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
            entryBuffer,
            0,
            asGpuBufferSource(layout.entries)
        );
        const trueEdgeBindGroup = this.device.createBindGroup({
            label: gpuLabel(label, "true-distance edge raster bindings"),
            layout: pipelines.edge.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: segmentBuffer } },
                { binding: 1, resource: { buffer: jobBuffer } },
                { binding: 2, resource: { buffer: scratchBuffer } },
                { binding: 3, resource: { buffer: trueScratchBuffer } },
                { binding: 4, resource: { buffer: trueParamsBuffer } },
            ],
        });
        const pseudoEdgeBindGroup = this.device.createBindGroup({
            label: gpuLabel(label, "pseudo-distance edge raster bindings"),
            layout: pipelines.edge.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: segmentBuffer } },
                { binding: 1, resource: { buffer: jobBuffer } },
                { binding: 2, resource: { buffer: scratchBuffer } },
                { binding: 3, resource: { buffer: trueScratchBuffer } },
                { binding: 4, resource: { buffer: pseudoParamsBuffer } },
            ],
        });
        const rawBindGroup = this.device.createBindGroup({
            label: gpuLabel(label, "raw distance bindings"),
            layout: pipelines.raw.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: segmentBuffer } },
                { binding: 1, resource: { buffer: jobBuffer } },
                { binding: 2, resource: { buffer: scratchBuffer } },
                { binding: 3, resource: rawTexture.createView() },
                { binding: 4, resource: { buffer: pseudoParamsBuffer } },
            ],
        });
        const correctionBindGroup = this.device.createBindGroup({
            label: gpuLabel(label, "correction bindings"),
            layout: pipelines.correction.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: rawTexture.createView() },
                { binding: 1, resource: texture.createView() },
                { binding: 2, resource: { buffer: pseudoParamsBuffer } },
                { binding: 3, resource: { buffer: jobBuffer } },
            ],
        });

        const scratchSize = layout.width * layout.height * 3 * 4;
        const encoder = this.device.createCommandEncoder({
            label: gpuLabel(label, "generation commands"),
        });
        encoder.clearBuffer(scratchBuffer, 0, scratchSize);
        encoder.clearBuffer(trueScratchBuffer, 0, scratchSize);
        const trueRenderPass = encoder.beginRenderPass({
            label: gpuLabel(label, "true-distance edge raster pass"),
            colorAttachments: [
                {
                    view: texture.createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        trueRenderPass.setPipeline(pipelines.edge);
        trueRenderPass.setBindGroup(0, trueEdgeBindGroup);
        trueRenderPass.draw(6, layout.segments.length);
        trueRenderPass.end();
        encoder.copyBufferToBuffer(
            trueScratchBuffer,
            0,
            scratchBuffer,
            0,
            scratchSize
        );
        const pseudoRenderPass = encoder.beginRenderPass({
            label: gpuLabel(label, "pseudo-distance edge raster pass"),
            colorAttachments: [
                {
                    view: texture.createView(),
                    loadOp: "load",
                    storeOp: "store",
                },
            ],
        });
        pseudoRenderPass.setPipeline(pipelines.edge);
        pseudoRenderPass.setBindGroup(0, pseudoEdgeBindGroup);
        pseudoRenderPass.draw(6, layout.segments.length);
        pseudoRenderPass.end();

        const rawPass = encoder.beginComputePass({
            label: gpuLabel(label, "raw distance pass"),
        });
        rawPass.setPipeline(pipelines.raw);
        rawPass.setBindGroup(0, rawBindGroup);
        rawPass.dispatchWorkgroups(
            Math.ceil(layout.maxSlotWidth / 8),
            Math.ceil(layout.maxSlotHeight / 8),
            layout.uniquePathCount
        );
        rawPass.end();

        const correctionPass = encoder.beginComputePass({
            label: gpuLabel(label, "correction pass"),
        });
        correctionPass.setPipeline(pipelines.correction);
        correctionPass.setBindGroup(0, correctionBindGroup);
        correctionPass.dispatchWorkgroups(
            Math.ceil(layout.maxSlotWidth / 8),
            Math.ceil(layout.maxSlotHeight / 8),
            layout.uniquePathCount
        );
        correctionPass.end();
        this.device.queue.submit([encoder.finish()]);

        let atlasDestroyed = false;
        return {
            ...layout,
            texture,
            entryBuffer,
            format,
            version: 1,
            completion: this.device.queue.onSubmittedWorkDone(),
            destroy: () => {
                if (!atlasDestroyed) {
                    atlasDestroyed = true;
                    texture.destroy();
                    entryBuffer.destroy();
                }
            },
        };
    }

    /**
     * Return a device-lifetime immutable atlas for an exact canonical table.
     *
     * @param {string[]} paths
     * @param {{ tileSize?: number, spread?: number, shapePadding?: number, gutter?: number, cubicTolerance?: number, normalizationSpan?: number, tightPacking?: boolean, maxAtlasWidth?: number, format?: "rgba8unorm" | "rgba16float" }} [options]
     * @param {string} [label]
     */
    acquireAtlas(paths, options = {}, label = "path atlas") {
        if (this._destroyed) {
            throw new Error("MSDF atlas generator has been destroyed.");
        }
        const key = atlasCacheKey(paths, options);
        let atlas = this._atlasCache.get(key);
        if (!atlas) {
            atlas = this.createAtlas(paths, options, label);
            this._atlasCache.set(key, atlas);
            void atlas.completion.catch(() => {
                if (this._atlasCache.get(key) === atlas) {
                    this._atlasCache.delete(key);
                    atlas.destroy();
                }
            });
        }
        return atlas;
    }

    /** Destroy reusable scratch after all submitted generation completes. */
    destroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        for (const atlas of this._atlasCache.values()) {
            atlas.destroy();
        }
        this._atlasCache.clear();
        this._retire(this._segmentBuffer);
        this._retire(this._jobBuffer);
        this._retire(this._trueParamsBuffer);
        this._retire(this._pseudoParamsBuffer);
        this._retire(this._scratchBuffer);
        this._retire(this._trueScratchBuffer);
        this._retire(this._rawTexture);
        this._segmentBuffer = null;
        this._jobBuffer = null;
        this._trueParamsBuffer = null;
        this._pseudoParamsBuffer = null;
        this._scratchBuffer = null;
        this._trueScratchBuffer = null;
        this._rawTexture = null;
    }
}

/** @type {WeakMap<import("../renderer.js").Renderer, MsdfAtlasGenerator>} */
const generatorByRenderer = new WeakMap();

/**
 * Lazily create the shared generator without making the base renderer import
 * path parsing or WGSL generation code.
 *
 * @param {import("../renderer.js").Renderer} renderer
 */
export function getMsdfAtlasGenerator(renderer) {
    let generator = generatorByRenderer.get(renderer);
    if (!generator) {
        generator = renderer._ownResource(
            new MsdfAtlasGenerator(renderer.device)
        );
        generatorByRenderer.set(renderer, generator);
    }
    return generator;
}

/**
 * Generate an RGB MSDF-like path atlas entirely on the GPU.
 *
 * @param {GPUDevice} device
 * @param {string[]} paths
 * @param {{ tileSize?: number, spread?: number, shapePadding?: number, gutter?: number, cubicTolerance?: number, normalizationSpan?: number, tightPacking?: boolean, maxAtlasWidth?: number, format?: "rgba8unorm" | "rgba16float" }} [options]
 * @param {string} [label]
 */
export function createSparseGpuPathAtlas(
    device,
    paths,
    options = {},
    label = "path atlas"
) {
    const generator = new MsdfAtlasGenerator(device);
    const atlas = generator.createAtlas(paths, options, label);
    atlas.completion.then(
        () => generator.destroy(),
        () => generator.destroy()
    );
    return atlas;
}
