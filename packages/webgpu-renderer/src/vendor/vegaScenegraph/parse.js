/**
 * Adapted from Vega Scenegraph's SVG path parser.
 * https://github.com/vega/vega/blob/79aa7d9de7b09604c5f881a09fd528d2b561d12f/packages/vega-scenegraph/src/path/parse.js
 */

/** @type {Record<string, number>} */
const PARAM_COUNTS = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    z: 0,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
};
const COMMAND_PATTERN = /[mlhvzcsqta]([^mlhvzcsqta]*)/gi;
const NUMBER_PATTERN =
    /^[+-]?(([0-9]*\.[0-9]+)|([0-9]+\.)|([0-9]+))([eE][+-]?[0-9]+)?/;
const SPACE_PATTERN = /^((\s+,?\s*)|(,\s*))/;
const FLAG_PATTERN = /^[01]/;

/**
 * @typedef {[string, ...number[]]} ParsedPathCommand
 */

/**
 * @param {string} path
 * @returns {ParsedPathCommand[]}
 */
export function parseSvgPath(path) {
    /** @type {ParsedPathCommand[]} */
    const commands = [];
    const matches = path.match(COMMAND_PATTERN) || [];

    for (const segment of matches) {
        let command = segment[0];
        const type = command.toLowerCase();
        const paramCount = PARAM_COUNTS[type];
        const params = parseParams(type, paramCount, segment.slice(1).trim());
        const count = params.length;

        if (count < paramCount || (count && count % paramCount !== 0)) {
            throw new Error("Invalid SVG path, incorrect parameter count.");
        }

        commands.push(
            /** @type {ParsedPathCommand} */ ([
                command,
                ...params.slice(0, paramCount),
            ])
        );
        if (count === paramCount) {
            continue;
        }
        if (type === "m") {
            command = command === "M" ? "L" : "l";
        }
        for (let i = paramCount; i < count; i += paramCount) {
            commands.push(
                /** @type {ParsedPathCommand} */ ([
                    command,
                    ...params.slice(i, i + paramCount),
                ])
            );
        }
    }

    if (commands.length === 0 && path.trim() !== "") {
        throw new Error("Invalid SVG path, no commands found.");
    }
    return commands;
}

/**
 * @param {string} type
 * @param {number} paramCount
 * @param {string} segment
 * @returns {number[]}
 */
function parseParams(type, paramCount, segment) {
    const params = [];
    for (let index = 0; paramCount && index < segment.length;) {
        for (let i = 0; i < paramCount; i++) {
            const pattern =
                type === "a" && (i === 3 || i === 4)
                    ? FLAG_PATTERN
                    : NUMBER_PATTERN;
            const match = segment.slice(index).match(pattern);
            if (match === null) {
                throw new Error("Invalid SVG path, incorrect parameter type.");
            }
            index += match[0].length;
            params.push(+match[0]);
            const whitespace = segment.slice(index).match(SPACE_PATTERN);
            if (whitespace !== null) {
                index += whitespace[0].length;
            }
        }
    }
    return params;
}
