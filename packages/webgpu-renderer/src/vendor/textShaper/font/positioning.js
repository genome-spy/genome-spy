/** @typedef {import("./reader.js").Reader} Reader */

const X_PLACEMENT = 0x0001;
const Y_PLACEMENT = 0x0002;
const X_ADVANCE = 0x0004;
const Y_ADVANCE = 0x0008;
const X_PLACEMENT_DEVICE = 0x0010;
const Y_PLACEMENT_DEVICE = 0x0020;
const X_ADVANCE_DEVICE = 0x0040;
const Y_ADVANCE_DEVICE = 0x0080;
const GPOS_PAIR_ADJUSTMENT = 2;
const GPOS_EXTENSION_POSITIONING = 9;

/**
 * @typedef {object} PairAdjustment
 * @property {number} firstPlacement
 * @property {number} firstAdvance
 * @property {number} secondPlacement
 * @property {number} secondAdvance
 */

function emptyAdjustment() {
    return {
        firstPlacement: 0,
        firstAdvance: 0,
        secondPlacement: 0,
        secondAdvance: 0,
    };
}

/** @param {PairAdjustment} target @param {PairAdjustment} source */
function addAdjustment(target, source) {
    target.firstPlacement += source.firstPlacement;
    target.firstAdvance += source.firstAdvance;
    target.secondPlacement += source.secondPlacement;
    target.secondAdvance += source.secondAdvance;
}

/** @param {Reader} base @param {number} offset */
function offsetSlice(base, offset) {
    return base.slice(offset, base.length - offset);
}

/** @param {Reader} value @param {number} format */
function parseValueRecord(value, format) {
    const result = { placement: 0, advance: 0 };
    if (format & X_PLACEMENT) {
        result.placement = value.int16();
    }
    if (format & Y_PLACEMENT) {
        value.int16();
    }
    if (format & X_ADVANCE) {
        result.advance = value.int16();
    }
    if (format & Y_ADVANCE) {
        value.int16();
    }
    if (format & X_PLACEMENT_DEVICE) {
        value.uint16();
    }
    if (format & Y_PLACEMENT_DEVICE) {
        value.uint16();
    }
    if (format & X_ADVANCE_DEVICE) {
        value.uint16();
    }
    if (format & Y_ADVANCE_DEVICE) {
        value.uint16();
    }
    return result;
}

/**
 * @param {{ placement: number, advance: number }} first
 * @param {{ placement: number, advance: number }} second
 * @returns {PairAdjustment}
 */
function pairAdjustment(first, second) {
    return {
        firstPlacement: first.placement,
        firstAdvance: first.advance,
        secondPlacement: second.placement,
        secondAdvance: second.advance,
    };
}

/** @param {Reader} base @param {number} offset */
function parseCoverage(base, offset) {
    const coverage = offsetSlice(base, offset);
    const format = coverage.uint16();
    if (format === 1) {
        const glyphs = Array.from({ length: coverage.uint16() }, () =>
            coverage.uint16()
        );
        return {
            /** @param {number} glyphId */
            indexOf(glyphId) {
                let low = 0;
                let high = glyphs.length - 1;
                while (low <= high) {
                    const middle = (low + high) >>> 1;
                    const candidate = glyphs[middle];
                    if (glyphId < candidate) {
                        high = middle - 1;
                    } else if (glyphId > candidate) {
                        low = middle + 1;
                    } else {
                        return middle;
                    }
                }
                return -1;
            },
            /** @param {number} index */
            glyphAt(index) {
                return glyphs[index];
            },
        };
    }
    if (format === 2) {
        const ranges = Array.from({ length: coverage.uint16() }, () => ({
            start: coverage.uint16(),
            end: coverage.uint16(),
            startIndex: coverage.uint16(),
        }));
        return {
            /** @param {number} glyphId */
            indexOf(glyphId) {
                for (const range of ranges) {
                    if (glyphId < range.start) {
                        return -1;
                    }
                    if (glyphId <= range.end) {
                        return range.startIndex + glyphId - range.start;
                    }
                }
                return -1;
            },
            /** @param {number} index */
            glyphAt(index) {
                for (const range of ranges) {
                    const rangeLength = range.end - range.start + 1;
                    if (
                        index >= range.startIndex &&
                        index < range.startIndex + rangeLength
                    ) {
                        return range.start + index - range.startIndex;
                    }
                }
                return undefined;
            },
        };
    }
    throw new Error(`Unsupported OpenType coverage format ${format}.`);
}

/** @param {Reader} base @param {number} offset */
function parseClassDefinition(base, offset) {
    const definition = offsetSlice(base, offset);
    const format = definition.uint16();
    if (format === 1) {
        const startGlyph = definition.uint16();
        const classes = Array.from({ length: definition.uint16() }, () =>
            definition.uint16()
        );
        return /** @param {number} glyphId */ (glyphId) =>
            classes[glyphId - startGlyph] ?? 0;
    }
    if (format === 2) {
        const ranges = Array.from({ length: definition.uint16() }, () => ({
            start: definition.uint16(),
            end: definition.uint16(),
            classId: definition.uint16(),
        }));
        return /** @param {number} glyphId */ (glyphId) => {
            for (const range of ranges) {
                if (glyphId < range.start) {
                    return 0;
                }
                if (glyphId <= range.end) {
                    return range.classId;
                }
            }
            return 0;
        };
    }
    throw new Error(`Unsupported OpenType class definition format ${format}.`);
}

/**
 * @param {Reader} subtable
 * @returns {(leftGlyphId: number, rightGlyphId: number) => PairAdjustment | null}
 */
function parsePairPositioningFormat1(subtable) {
    const coverageOffset = subtable.uint16();
    const valueFormat1 = subtable.uint16();
    const valueFormat2 = subtable.uint16();
    const pairSetCount = subtable.uint16();
    const pairSetOffsets = Array.from({ length: pairSetCount }, () =>
        subtable.uint16()
    );
    const coverage = parseCoverage(subtable, coverageOffset);
    const pairsByLeft = new Map();
    for (let coverageIndex = 0; coverageIndex < pairSetCount; coverageIndex++) {
        const leftGlyphId = coverage.glyphAt(coverageIndex);
        if (leftGlyphId === undefined) {
            throw new Error("GPOS pair set has no matching coverage glyph.");
        }
        const pairSet = offsetSlice(subtable, pairSetOffsets[coverageIndex]);
        const pairs = new Map();
        for (let index = 0, count = pairSet.uint16(); index < count; index++) {
            const rightGlyphId = pairSet.uint16();
            const first = parseValueRecord(pairSet, valueFormat1);
            const second = parseValueRecord(pairSet, valueFormat2);
            pairs.set(rightGlyphId, pairAdjustment(first, second));
        }
        pairsByLeft.set(leftGlyphId, pairs);
    }
    return (leftGlyphId, rightGlyphId) =>
        pairsByLeft.get(leftGlyphId)?.get(rightGlyphId) ?? null;
}

/**
 * @param {Reader} subtable
 * @returns {(leftGlyphId: number, rightGlyphId: number) => PairAdjustment | null}
 */
function parsePairPositioningFormat2(subtable) {
    const coverageOffset = subtable.uint16();
    const valueFormat1 = subtable.uint16();
    const valueFormat2 = subtable.uint16();
    const classDefinition1Offset = subtable.uint16();
    const classDefinition2Offset = subtable.uint16();
    const class1Count = subtable.uint16();
    const class2Count = subtable.uint16();
    const pairCount = class1Count * class2Count;
    if (!Number.isSafeInteger(pairCount) || pairCount > 1_000_000) {
        throw new Error("GPOS pair-class matrix is unreasonably large.");
    }
    const adjustments = Array.from({ length: pairCount }, () => {
        const first = parseValueRecord(subtable, valueFormat1);
        const second = parseValueRecord(subtable, valueFormat2);
        return pairAdjustment(first, second);
    });
    const coverage = parseCoverage(subtable, coverageOffset);
    const classOfFirst = parseClassDefinition(subtable, classDefinition1Offset);
    const classOfSecond = parseClassDefinition(
        subtable,
        classDefinition2Offset
    );
    return (leftGlyphId, rightGlyphId) => {
        if (coverage.indexOf(leftGlyphId) < 0) {
            return null;
        }
        const class1 = classOfFirst(leftGlyphId);
        const class2 = classOfSecond(rightGlyphId);
        if (class1 >= class1Count || class2 >= class2Count) {
            throw new Error("GPOS pair references an invalid glyph class.");
        }
        return adjustments[class1 * class2Count + class2];
    };
}

/**
 * @param {Reader} subtable
 * @returns {(leftGlyphId: number, rightGlyphId: number) => PairAdjustment | null}
 */
function parsePairPositioning(subtable) {
    const format = subtable.uint16();
    if (format === 1) {
        return parsePairPositioningFormat1(subtable);
    }
    if (format === 2) {
        return parsePairPositioningFormat2(subtable);
    }
    throw new Error(`Unsupported GPOS pair adjustment format ${format}.`);
}

/** @param {Reader} scriptList */
function selectFeatureIndices(scriptList) {
    const scriptCount = scriptList.uint16();
    const scripts = Array.from({ length: scriptCount }, () => ({
        tag: scriptList.tag(),
        offset: scriptList.uint16(),
    }));
    const selected =
        scripts.find((script) => script.tag === "latn") ??
        scripts.find((script) => script.tag === "DFLT") ??
        scripts[0];
    if (!selected) {
        return [];
    }
    const script = offsetSlice(scriptList, selected.offset);
    const defaultLanguageOffset = script.uint16();
    const languageCount = script.uint16();
    const languages = Array.from({ length: languageCount }, () => {
        script.tag();
        return script.uint16();
    });
    const languageOffset = defaultLanguageOffset || languages[0];
    if (!languageOffset) {
        return [];
    }
    const language = offsetSlice(script, languageOffset);
    language.uint16();
    const requiredFeature = language.uint16();
    const featureIndices = Array.from({ length: language.uint16() }, () =>
        language.uint16()
    );
    if (requiredFeature !== 0xffff) {
        featureIndices.unshift(requiredFeature);
    }
    return featureIndices;
}

/** @param {Reader} featureList @param {number[]} selectedIndices */
function selectKerningLookupIndices(featureList, selectedIndices) {
    const featureCount = featureList.uint16();
    const features = Array.from({ length: featureCount }, () => ({
        tag: featureList.tag(),
        offset: featureList.uint16(),
    }));
    const selected = new Set(selectedIndices);
    const lookupIndices = [];
    for (let index = 0; index < features.length; index++) {
        const feature = features[index];
        if (feature.tag !== "kern" || !selected.has(index)) {
            continue;
        }
        const table = offsetSlice(featureList, feature.offset);
        table.uint16();
        const count = table.uint16();
        for (let lookup = 0; lookup < count; lookup++) {
            lookupIndices.push(table.uint16());
        }
    }
    return lookupIndices;
}

/**
 * Parse the basic-Latin subset of OpenType GPOS kerning. This is a reduced
 * adaptation boundary for the text-shaper-derived TrueType reader; see
 * ../NOTICE.md.
 *
 * @param {Reader} gpos
 * @returns {((leftGlyphId: number, rightGlyphId: number) => PairAdjustment) | null}
 */
export function parseGposKerning(gpos) {
    const majorVersion = gpos.uint16();
    const minorVersion = gpos.uint16();
    if (majorVersion !== 1 || (minorVersion !== 0 && minorVersion !== 1)) {
        throw new Error("Unsupported GPOS table version.");
    }
    const scriptListOffset = gpos.uint16();
    const featureListOffset = gpos.uint16();
    const lookupListOffset = gpos.uint16();
    if (minorVersion === 1) {
        gpos.uint32();
    }
    const selectedFeatureIndices = selectFeatureIndices(
        offsetSlice(gpos, scriptListOffset)
    );
    const lookupIndices = selectKerningLookupIndices(
        offsetSlice(gpos, featureListOffset),
        selectedFeatureIndices
    );
    if (lookupIndices.length === 0) {
        return null;
    }
    const lookupList = offsetSlice(gpos, lookupListOffset);
    const lookupCount = lookupList.uint16();
    const lookupOffsets = Array.from({ length: lookupCount }, () =>
        lookupList.uint16()
    );
    const lookupFunctions = lookupIndices.map((lookupIndex) => {
        const lookupOffset = lookupOffsets[lookupIndex];
        if (lookupOffset === undefined) {
            throw new Error("GPOS kern feature references a missing lookup.");
        }
        const lookup = offsetSlice(lookupList, lookupOffset);
        const lookupType = lookup.uint16();
        lookup.uint16();
        const subtableOffsets = Array.from({ length: lookup.uint16() }, () =>
            lookup.uint16()
        );
        const subtables = subtableOffsets.map((subtableOffset) => {
            const subtable = offsetSlice(lookup, subtableOffset);
            if (lookupType === GPOS_PAIR_ADJUSTMENT) {
                return parsePairPositioning(subtable);
            }
            if (lookupType === GPOS_EXTENSION_POSITIONING) {
                const format = subtable.uint16();
                const extensionLookupType = subtable.uint16();
                const extensionOffset = subtable.uint32();
                if (
                    format !== 1 ||
                    extensionLookupType !== GPOS_PAIR_ADJUSTMENT
                ) {
                    throw new Error("Unsupported GPOS extension positioning.");
                }
                return parsePairPositioning(
                    offsetSlice(subtable, extensionOffset)
                );
            }
            throw new Error(`Unsupported GPOS kern lookup type ${lookupType}.`);
        });
        /** @type {(leftGlyphId: number, rightGlyphId: number) => PairAdjustment | null} */
        const applyLookup = (leftGlyphId, rightGlyphId) => {
            for (const subtable of subtables) {
                const adjustment = subtable(leftGlyphId, rightGlyphId);
                if (adjustment) {
                    return adjustment;
                }
            }
            return null;
        };
        return applyLookup;
    });
    return (leftGlyphId, rightGlyphId) => {
        const result = emptyAdjustment();
        for (const lookup of lookupFunctions) {
            const adjustment = lookup(leftGlyphId, rightGlyphId);
            if (adjustment) {
                addAdjustment(result, adjustment);
            }
        }
        return result;
    };
}

/**
 * @param {Reader} kern
 * @returns {((leftGlyphId: number, rightGlyphId: number) => PairAdjustment) | null}
 */
export function parseLegacyKerning(kern) {
    if (kern.uint16() !== 0) {
        return null;
    }
    const subtableCount = kern.uint16();
    const pairs = new Map();
    for (let tableIndex = 0; tableIndex < subtableCount; tableIndex++) {
        const subtableStart = kern.offset;
        kern.uint16();
        const length = kern.uint16();
        const coverage = kern.uint16();
        const format = coverage >> 8;
        const isHorizontal = Boolean(coverage & 0x0001);
        const isMinimum = Boolean(coverage & 0x0002);
        const isCrossStream = Boolean(coverage & 0x0004);
        const overrides = Boolean(coverage & 0x0008);
        if (format === 0 && isHorizontal && !isMinimum && !isCrossStream) {
            const pairCount = kern.uint16();
            kern.skip(6);
            for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
                const leftGlyphId = kern.uint16();
                const rightGlyphId = kern.uint16();
                const value = kern.int16();
                const key = leftGlyphId * 65536 + rightGlyphId;
                pairs.set(
                    key,
                    overrides ? value : (pairs.get(key) ?? 0) + value
                );
            }
        }
        if (length < 6 || subtableStart + length > kern.length) {
            throw new RangeError("Legacy kern subtable exceeds its table.");
        }
        kern.seek(subtableStart + length);
    }
    if (pairs.size === 0) {
        return null;
    }
    return (leftGlyphId, rightGlyphId) => ({
        firstPlacement: 0,
        firstAdvance: pairs.get(leftGlyphId * 65536 + rightGlyphId) ?? 0,
        secondPlacement: 0,
        secondAdvance: 0,
    });
}

/**
 * Prefer modern GPOS kerning and fall back to the legacy `kern` table only
 * when no usable GPOS `kern` feature exists.
 *
 * @param {Reader} font
 * @param {Map<string, { offset: number, length: number }>} tables
 */
export function parsePairAdjustment(font, tables) {
    const gposTable = tables.get("GPOS");
    if (gposTable) {
        const gpos = parseGposKerning(
            font.slice(gposTable.offset, gposTable.length)
        );
        if (gpos) {
            return gpos;
        }
    }
    const kernTable = tables.get("kern");
    if (kernTable) {
        const kern = parseLegacyKerning(
            font.slice(kernTable.offset, kernTable.length)
        );
        if (kern) {
            return kern;
        }
    }
    return () => emptyAdjustment();
}
