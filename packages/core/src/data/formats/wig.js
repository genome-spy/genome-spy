import { formats as vegaFormats } from "vega-loader";

const declarationPattern = /^(?:variableStep|fixedStep)(?:\s|$)/;
const controlLinePattern = /^(?:browser\b|track\b|#)/;

/**
 * @typedef {object} VariableStepBlock
 * @prop {"variableStep"} type
 * @prop {string} chrom
 * @prop {number} span
 */

/**
 * @typedef {object} FixedStepBlock
 * @prop {"fixedStep"} type
 * @prop {string} chrom
 * @prop {number} nextPosition
 * @prop {number} step
 * @prop {number} span
 */

/** @typedef {VariableStepBlock | FixedStepBlock} WigBlock */

/**
 * Parse WIG text into GenomeSpy genomic interval rows.
 *
 * WIG positions are 1-based and fully closed. The returned intervals use
 * GenomeSpy's 0-based, half-open convention.
 *
 * @param {string} data
 * @returns {Record<string, any>[]}
 */
export default function wig(data) {
    /** @type {WigBlock | undefined} */
    let block;

    /** @type {Record<string, any>[]} */
    const rows = [];
    const lines = data.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const lineNumber = i + 1;
        const line = lines[i].trim();

        if (!line || controlLinePattern.test(line)) {
            continue;
        }

        if (declarationPattern.test(line)) {
            block = parseDeclaration(line, lineNumber);
            continue;
        }

        if (!block) {
            throw parseError(lineNumber, "data appears before a declaration");
        }

        const fields = line.split(/\s+/);
        if (block.type == "fixedStep") {
            if (fields.length != 1) {
                throw parseError(
                    lineNumber,
                    "fixedStep data must contain one value"
                );
            }

            const score = parseScore(fields[0], lineNumber);
            const start = block.nextPosition - 1;
            rows.push({
                chrom: block.chrom,
                start,
                end: start + block.span,
                score,
            });
            block.nextPosition += block.step;
        } else {
            if (fields.length != 2) {
                throw parseError(
                    lineNumber,
                    "variableStep data must contain a position and value"
                );
            }

            const position = parsePositiveInteger(
                fields[0],
                "position",
                lineNumber
            );
            const start = position - 1;
            rows.push({
                chrom: block.chrom,
                start,
                end: start + block.span,
                score: parseScore(fields[1], lineNumber),
            });
        }
    }

    return rows;
}

/**
 * @param {string} line
 * @param {number} lineNumber
 * @returns {WigBlock}
 */
function parseDeclaration(line, lineNumber) {
    const [type, ...attributeTokens] = line.split(/\s+/);
    /** @type {Record<string, string>} */
    const attributes = {};

    for (const token of attributeTokens) {
        const separator = token.indexOf("=");
        if (separator <= 0 || separator == token.length - 1) {
            throw parseError(
                lineNumber,
                `invalid declaration attribute "${token}"`
            );
        }

        const name = token.slice(0, separator);
        if (name in attributes) {
            throw parseError(lineNumber, `duplicate attribute "${name}"`);
        }
        attributes[name] = token.slice(separator + 1);
    }

    if (type == "variableStep") {
        requireAttribute(attributes, "chrom", type, lineNumber);

        return {
            type: "variableStep",
            chrom: attributes.chrom,
            span: attributes.span
                ? parsePositiveInteger(attributes.span, "span", lineNumber)
                : 1,
        };
    }

    requireAttribute(attributes, "chrom", type, lineNumber);
    requireAttribute(attributes, "start", type, lineNumber);

    return {
        type: "fixedStep",
        chrom: attributes.chrom,
        nextPosition: parsePositiveInteger(
            attributes.start,
            "start",
            lineNumber
        ),
        step: attributes.step
            ? parsePositiveInteger(attributes.step, "step", lineNumber)
            : 1,
        span: attributes.span
            ? parsePositiveInteger(attributes.span, "span", lineNumber)
            : 1,
    };
}

/**
 * @param {Record<string, string>} attributes
 * @param {string} name
 * @param {string} type
 * @param {number} lineNumber
 */
function requireAttribute(attributes, name, type, lineNumber) {
    if (!(name in attributes)) {
        throw parseError(
            lineNumber,
            `${type} declaration is missing "${name}"`
        );
    }
}

/**
 * @param {string} value
 * @param {string} name
 * @param {number} lineNumber
 */
function parsePositiveInteger(value, name, lineNumber) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw parseError(lineNumber, `${name} must be a positive integer`);
    }
    return parsed;
}

/**
 * @param {string} value
 * @param {number} lineNumber
 */
function parseScore(value, lineNumber) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw parseError(lineNumber, "score must be a finite number");
    }
    return parsed;
}

/**
 * @param {number} lineNumber
 * @param {string} message
 */
function parseError(lineNumber, message) {
    return new Error(`Cannot parse WIG line ${lineNumber}: ${message}`);
}

vegaFormats("wig", wig);
