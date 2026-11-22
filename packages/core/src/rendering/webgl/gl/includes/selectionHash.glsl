const highp uint HASH_EMPTY_KEY = 0xffffffffu;

highp uint hash32(highp uint key) {
    highp uint v = key;
    v ^= v >> 16u;
    v *= 0x7feb352du;
    v ^= v >> 15u;
    v *= 0x846ca68bu;
    v ^= v >> 16u;
    return v;
}

bool isEmptyHashTexture(highp usampler2D s) {
    // Empty selections are encoded as a single empty hash slot.
    ivec2 texSize = textureSize(s, 0);
    return texSize.x == 1 && texSize.y == 1 && texelFetch(s, ivec2(0, 0), 0).r == HASH_EMPTY_KEY;
}

bool hashContainsTexture(highp usampler2D s, highp uint value) {
    ivec2 texSize = textureSize(s, 0);
    highp uint width = uint(texSize.x);
    highp uint size = width * uint(texSize.y);
    highp uint mask = size - 1u;
    highp uint index = hash32(value) & mask;

    for (highp uint probe = 0u; probe < size; probe += 1u) {
        ivec2 coord = ivec2(int(index % width), int(index / width));
        highp uint entry = texelFetch(s, coord, 0).r;
        if (entry == value) {
            return true;
        }
        if (entry == HASH_EMPTY_KEY) {
            return false;
        }
        index = (index + 1u) & mask;
    }

    return false;
}
