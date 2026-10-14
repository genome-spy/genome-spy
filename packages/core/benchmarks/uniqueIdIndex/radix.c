#include <stdint.h>

// Stable scalar LSD radix sort of uint64 keys and uint32 physical positions.
// JS supplies exact nonnegative safe integers as doubles in the key region.
// This is deliberately not F5 and does not use SIMD intrinsics.
uint32_t sort_ids(uint32_t base, uint32_t n) {
    double *input = (double *)(uintptr_t)base;
    uint64_t *keys = (uint64_t *)(uintptr_t)base;
    uint64_t *scratch_keys = keys + n;
    uint32_t *positions = (uint32_t *)(scratch_keys + n);
    uint32_t *scratch_positions = positions + n;
    uint64_t max = 0;
    uint64_t previous = 0;
    int sorted = 1;
    for (uint32_t i = 0; i < n; i++) {
        uint64_t key = (uint64_t)input[i];
        if (key < previous) sorted = 0;
        previous = key;
        if (key > max) max = key;
        keys[i] = key;
        positions[i] = i;
    }
    if (sorted) return (uint32_t)(uintptr_t)positions;
    for (uint32_t shift = 0; shift < 64 && (max >> shift); shift += 8) {
        uint32_t counts[256] = {0};
        for (uint32_t i = 0; i < n; i++) counts[(keys[i] >> shift) & 255]++;
        uint32_t total = 0;
        for (uint32_t b = 0; b < 256; b++) {
            uint32_t count = counts[b];
            counts[b] = total;
            total += count;
        }
        for (uint32_t i = 0; i < n; i++) {
            uint32_t slot = counts[(keys[i] >> shift) & 255]++;
            scratch_keys[slot] = keys[i];
            scratch_positions[slot] = positions[i];
        }
        uint64_t *k = keys;
        keys = scratch_keys;
        scratch_keys = k;
        uint32_t *p = positions;
        positions = scratch_positions;
        scratch_positions = p;
    }
    return (uint32_t)(uintptr_t)positions;
}

uint32_t noop(uint32_t x) { return x; }
