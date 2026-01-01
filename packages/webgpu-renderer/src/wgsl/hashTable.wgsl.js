export default /* wgsl */ `

const HASH_EMPTY_KEY: u32 = 0xffffffffu;
const HASH_NOT_FOUND: u32 = 0xffffffffu;

struct HashEntry {
    key: u32,
    value: u32,
};

// 32-bit integer hash for u32 keys. Keep in sync with JS hash32.
fn hash32(key: u32) -> u32 {
    var v = key;
    v ^= v >> 16u;
    v *= 0x7feb352du;
    v ^= v >> 15u;
    v *= 0x846ca68bu;
    v ^= v >> 16u;
    return v;
}

fn hashLookup(entries: ptr<storage, array<HashEntry>>, key: u32, maxProbes: u32) -> u32 {
    let size = arrayLength(entries);
    if (size == 0u) {
        return HASH_NOT_FOUND;
    }
    let mask = size - 1u;
    var index = hash32(key) & mask;
    for (var probe = 0u; probe < maxProbes; probe += 1u) {
        let entry = (*entries)[index];
        if (entry.key == key) {
            return entry.value;
        }
        if (entry.key == HASH_EMPTY_KEY) {
            return HASH_NOT_FOUND;
        }
        index = (index + 1u) & mask;
    }
    return HASH_NOT_FOUND;
}

fn hashContains(entries: ptr<storage, array<HashEntry>>, key: u32, maxProbes: u32) -> bool {
    return hashLookup(entries, key, maxProbes) != HASH_NOT_FOUND;
}
`;
