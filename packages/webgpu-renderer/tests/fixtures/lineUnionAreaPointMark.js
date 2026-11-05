import PathPointProgram, {
    createPathPointShaderBody,
} from "../../src/marks/programs/pathPointProgram.js";

/** Temporary actual-program fixture. No parser, descriptors or new resources. */
class LineUnionProofProgram extends PathPointProgram {
    get shaderBody() {
        const segments = /** @type {number[][]} */ (
            this._markConfig.proofSegments
        );
        const constants = segments
            .map(
                (s) =>
                    `vec4<f32>(${s.map((x) => Number(x).toPrecision(10)).join(",")})`
            )
            .join(",\n");
        let body = createPathPointShaderBody([2]);
        body = body.replace(
            "    @location(12) local: vec2<f32>,",
            "    @location(12) local: vec2<f32>,\n    @location(13) @interpolate(flat) proofRotation: vec2<f32>,"
        );
        body = body.replace(
            "    out.local = vec2<f32>(0.0);",
            "    out.local = vec2<f32>(0.0);\n    out.proofRotation = vec2<f32>(1.0,0.0);"
        );
        body = body.replace(
            "    out.local = localScreen;",
            "    out.local = rot * localScreen;\n    out.proofRotation = vec2<f32>(cosTheta,sinTheta);"
        );
        const extent = Math.max(...segments.flat().map(Math.abs));
        body = body.replace(
            "let extent = max(length, halfStrokeWidth) + 1.0 / globals.dpr;",
            `let extent = diameter * ${extent.toPrecision(10)} + halfStrokeWidth + 1.0 / globals.dpr;`
        );
        const start = body.indexOf(
            "    if (in.lineKind != 0u) {",
            body.indexOf("fn shade(")
        );
        const end = body.indexOf(
            "    if (pickingEnabled)",
            start + body.slice(start).indexOf("\n    }") + 6
        );
        body =
            body.slice(0, start) +
            `
    if (in.lineKind != 0u) {
        var paint = in.stroke;
        paint.a *= in.strokeOpacity;
        if (paint.a <= 0.0) { paint = in.fill; paint.a *= in.fillOpacity; }
        return premultiplyAlpha(paint) * proofCoverage(in.local * globals.dpr,
            in.deviceRadius * 2.0, in.halfStrokeWidth * globals.dpr, in.proofRotation);
    }
` +
            body.slice(end);
        return `const PROOF_COUNT: u32 = ${segments.length}u;
const PROOF_APPROXIMATE: bool = ${Boolean(this._markConfig.proofApproximate)};
const PROOF_SEGMENTS = array<vec4<f32>,${segments.length}>(${constants});
${AREA_WGSL}\n${body}`;
    }
}

/** Test-only definition uses the existing program, pass, quad and paint channels. */
export const lineUnionAreaPointMark = {
    type: "point",
    getProgramKey(config) {
        return JSON.stringify([
            config.proofSegments,
            Boolean(config.proofApproximate),
        ]);
    },
    createProgram(renderer, config, context) {
        return new LineUnionProofProgram(
            renderer,
            {
                ...config,
                paths: ["M-1-1H1V1H-1Z"],
                lineKinds: [2],
                atlasOptions: { normalizationSpan: 2 },
                channels: { ...config.channels, shape: { value: 0 } },
            },
            context
        );
    },
};

const AREA_WGSL = /* wgsl */ `
struct ProofRect { center: vec2<f32>, tangent: vec2<f32>, half: vec2<f32> };

fn proofSlab(interval: vec2<f32>, origin: f32, delta: f32, half: f32, parallelTolerance: f32) -> vec2<f32> {
    if (abs(delta) <= parallelTolerance) {
        if (abs(origin) > half + 0.000001) { return vec2<f32>(1.0,0.0); }
        return interval;
    }
    let ends = (vec2<f32>(-half,half) - origin) / delta;
    return vec2<f32>(max(interval.x,min(ends.x,ends.y)),min(interval.y,max(ends.x,ends.y)));
}

// Covered edge parameter interval, with same-/opposite-side boundary handling.
fn proofOccluded(a: vec2<f32>, delta: vec2<f32>, outward: vec2<f32>, other: ProofRect,
    sourceId: u32, otherId: u32) -> vec2<f32> {
    let normal = vec2<f32>(-other.tangent.y,other.tangent.x);
    let local = a - other.center;
    let parallelTolerance = length(delta) * 0.0000001;
    var interval = proofSlab(vec2<f32>(0.0,1.0), dot(local,other.tangent),dot(delta,other.tangent),other.half.x,parallelTolerance);
    interval = proofSlab(interval,dot(local,normal),dot(delta,normal),other.half.y,parallelTolerance);
    if (interval.x >= interval.y) { return vec2<f32>(1.0,0.0); }
    let midpoint = a + delta * ((interval.x + interval.y) * 0.5);
    // A midpoint close to a boundary is insufficient: nearly parallel edges
    // can cross there. Ownership applies only to coincident supporting lines.
    let coincident = (abs(dot(delta,other.tangent)) <= parallelTolerance &&
        abs(abs(dot(local,other.tangent))-other.half.x) <= 0.000001) ||
        (abs(dot(delta,normal)) <= parallelTolerance &&
        abs(abs(dot(local,normal))-other.half.y) <= 0.000001);
    if (coincident && dot(outward,other.center-midpoint) <= 0.0 && otherId > sourceId) {
        return vec2<f32>(1.0,0.0);
    }
    return interval;
}

// Antiderivative of the vertically clamped unit-pixel height function.
fn proofPrimitive(y: f32) -> f32 {
    let u = y + 0.5;
    if (u <= 0.0) { return u; }
    if (u >= 1.0) { return 0.5; }
    return u - 0.5*u*u;
}

fn proofEdgeArea(a: vec2<f32>, delta: vec2<f32>, interval: vec2<f32>) -> f32 {
    let begin = a + delta*interval.x;
    let end = a + delta*interval.y;
    let dx = end.x-begin.x;
    let dy = end.y-begin.y;
    if (max(begin.y,end.y) <= -0.5) { return dx; }
    if (min(begin.y,end.y) >= 0.5) { return 0.0; }
    if (abs(dy) < 0.0000001) { return dx * clamp(0.5-(begin.y+end.y)*0.5,0.0,1.0); }
    return dx * (proofPrimitive(end.y)-proofPrimitive(begin.y)) / dy;
}

fn proofCoverage(pixel: vec2<f32>, diameter: f32, halfWidth: f32, rotation: vec2<f32>) -> f32 {
    let rot = mat2x2<f32>(rotation.x,rotation.y,-rotation.y,rotation.x);
    var rectangles: array<ProofRect,PROOF_COUNT>;
    for (var i=0u;i<PROOF_COUNT;i++) {
        let segment = PROOF_SEGMENTS[i];
        let a=segment.xy*diameter;
        let b=segment.zw*diameter;
        let direction=b-a;
        rectangles[i]=ProofRect((a+b)*0.5,normalize(direction),vec2<f32>(length(direction)*0.5,halfWidth));
    }
    if (PROOF_APPROXIMATE) {
        var distance=1e20;
        for(var i=0u;i<PROOF_COUNT;i++) {
            let rect=rectangles[i];
            let local=transpose(rot)*pixel-rect.center;
            let normal=vec2<f32>(-rect.tangent.y,rect.tangent.x);
            let q=abs(vec2<f32>(dot(local,rect.tangent),dot(local,normal)))-rect.half;
            distance=min(distance,length(max(q,vec2<f32>(0.0)))+min(max(q.x,q.y),0.0));
        }
        return clamp(0.5-distance,0.0,1.0);
    }
    var area=0.0;
    for (var i=0u;i<PROOF_COUNT;i++) {
        let rect=rectangles[i];
        let along=rect.tangent*rect.half.x;
        let across=vec2<f32>(-rect.tangent.y,rect.tangent.x)*rect.half.y;
        let corners=array<vec2<f32>,4>(rect.center-along-across,rect.center+along-across,
            rect.center+along+across,rect.center-along+across);
        for (var edge=0u;edge<4u;edge++) {
            let origin=corners[edge];
            let localDelta=corners[(edge+1u)%4u]-origin;
            let a=rot*origin-pixel;
            let delta=rot*localDelta;
            if (abs(delta.x)<0.00000001) { continue; }
            let limits=(vec2<f32>(-0.5,0.5)-a.xx)/delta.xx;
            let interval=vec2<f32>(max(0.0,min(limits.x,limits.y)),min(1.0,max(limits.x,limits.y)));
            let outward=normalize(vec2<f32>(localDelta.y,-localDelta.x));
            var cursor=interval.x;
            // Covered intervals are merged by repeated traversal, not subtraction.
            // Worst-case O(N^3) per shape; cost is an explicit proof gate.
            for(var step=0u;step<2u*PROOF_COUNT+1u;step++) {
                if(cursor>=interval.y) { break; }
                var coveredEnd=cursor;
                var nextStart=interval.y;
                for(var j=0u;j<PROOF_COUNT;j++) {
                    if(i==j) { continue; }
                    let covered=proofOccluded(origin,localDelta,outward,rectangles[j],i,j);
                    if(covered.x>=covered.y || covered.y<=cursor) { continue; }
                    if(covered.x<=cursor+0.0000001) { coveredEnd=max(coveredEnd,covered.y); }
                    else { nextStart=min(nextStart,covered.x); }
                }
                if(coveredEnd>cursor) { cursor=min(interval.y,coveredEnd); }
                else { area+=proofEdgeArea(a,delta,vec2<f32>(cursor,nextStart));cursor=nextStart; }
            }
        }
    }
    return clamp(area,0.0,1.0);
}
`;
