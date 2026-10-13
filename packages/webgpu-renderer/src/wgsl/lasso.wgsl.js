import HASH_TABLE_WGSL, { emitHashLookupFunction } from "./hashTable.wgsl.js";

export default /* wgsl */ `
${HASH_TABLE_WGSL}
struct AtomicEntry { key: atomic<u32>, value: u32 };
struct Settings { count: u32, vertices: u32, grid: vec2<u32>, bounds: vec4<f32>, view: vec4<f32>, densityBounds: vec4<f32> };
@group(0) @binding(0) var<storage, read> xs: array<f32>;
@group(0) @binding(1) var<storage, read> ys: array<f32>;
@group(0) @binding(2) var<storage, read> ids: array<u32>;
@group(0) @binding(3) var<storage, read> polygon: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> table: array<AtomicEntry>;
@group(0) @binding(5) var<storage, read_write> selected: array<u32>;
@group(0) @binding(6) var<storage, read_write> selectedCount: atomic<u32>;
@group(0) @binding(7) var<uniform> settings: Settings;
@group(0) @binding(8) var<storage, read_write> density: array<atomic<u32>>;
@group(1) @binding(0) var<storage, read> committed: array<HashEntry>;
${emitHashLookupFunction("committed")}

fn index(gid: vec3<u32>, groups: vec3<u32>) -> u32 {
    return gid.x + gid.y * groups.x * 128u;
}

@compute @workgroup_size(128)
fn clear(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
    let i = index(gid, groups);
    if (i < arrayLength(&table)) {
        atomicStore(&table[i].key, HASH_EMPTY_KEY);
        table[i].value = 1u;
    }
    if (i < arrayLength(&density)) { atomicStore(&density[i], 0u); }
    if (i == 0u) { atomicStore(&selectedCount, 0u); }
}

@compute @workgroup_size(128)
fn clearDensity(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
    let i = index(gid, groups);
    if (i < arrayLength(&density)) { atomicStore(&density[i], 0u); }
}

fn countPixel(position: vec2<f32>) {
    if (any(settings.grid == vec2<u32>(0u)) ||
        !all(position >= settings.densityBounds.xy) ||
        !all(position <= settings.densityBounds.zw)) { return; }
    let p = (position - settings.view.xy) / (settings.view.zw - settings.view.xy);
    let pixel = vec2<u32>(clamp(vec2<f32>(p.x, 1.0 - p.y) * vec2<f32>(settings.grid), vec2<f32>(0.0), vec2<f32>(settings.grid - 1u)));
    atomicAdd(&density[pixel.y * settings.grid.x + pixel.x], 1u);
}

@compute @workgroup_size(128)
fn total(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
    let i = index(gid, groups);
    if (i < settings.count) { countPixel(vec2<f32>(xs[i], ys[i])); }
}

@compute @workgroup_size(128)
fn committedDensity(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
    let i = index(gid, groups);
    if (i < settings.count && hashLookup_committed(ids[i], arrayLength(&committed)) != HASH_NOT_FOUND) {
        countPixel(vec2<f32>(xs[i], ys[i]));
    }
}

fn contains(p: vec2<f32>) -> bool {
    if (!(p.x >= settings.bounds.x && p.y >= settings.bounds.y &&
          p.x <= settings.bounds.z && p.y <= settings.bounds.w)) { return false; }
    var inside = false;
    var a = polygon[settings.vertices - 1u];
    for (var j = 0u; j < settings.vertices; j++) {
        let b = polygon[j];
        let u = (p.x - a.x) * (b.y - a.y);
        let v = (p.y - a.y) * (b.x - a.x);
        // f32 arithmetic allowance; this preview is not an f64 CPU reference.
        if (abs(u - v) <= 4.0 * 1.1920929e-7 * (abs(u) + abs(v)) &&
            all(p >= min(a, b)) && all(p <= max(a, b))) { return true; }
        if ((a.y > p.y) != (b.y > p.y)) {
            if (p.x < a.x + (p.y - a.y) * (b.x - a.x) / (b.y - a.y)) { inside = !inside; }
        }
        a = b;
    }
    return inside;
}

@compute @workgroup_size(128)
fn select(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
    let i = index(gid, groups);
    if (i >= settings.count || !contains(vec2<f32>(xs[i], ys[i]))) { return; }
    countPixel(vec2<f32>(xs[i], ys[i]));
    let key = ids[i];
    let mask = arrayLength(&table) - 1u;
    var slot = hash32(key) & mask;
    // Capacity covers the entire population, so an empty slot always exists.
    loop {
        let result = atomicCompareExchangeWeak(&table[slot].key, HASH_EMPTY_KEY, key);
        if (result.exchanged) {
            let output = atomicAdd(&selectedCount, 1u);
            selected[output * 2u] = key;
            selected[output * 2u + 1u] = i;
            return;
        }
        if (result.old_value == key) { return; }
        if (result.old_value != HASH_EMPTY_KEY) { slot = (slot + 1u) & mask; }
    }
}
`;
