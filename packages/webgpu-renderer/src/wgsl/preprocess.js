/**
 * @typedef {Record<string, string | number | boolean>} Defines
 */

/**
 * Simple shader preprocessor for WGSL-like source.
 * Supports: #define, #undef, #if, #ifdef, #ifndef, #elif, #else, #endif
 *
 * Generated using ChatGPT Codex
 *
 * @param {string} source
 * @param {Defines} [defines]
 * @returns {string}
 */
export function preprocessShader(source, defines = {}) {
    /** @type {Map<string, string>} */
    const macros = new Map();
    for (const [key, value] of Object.entries(defines)) {
        macros.set(key, String(value));
    }

    /** @type {{ parentActive: boolean, active: boolean, anyTrue: boolean }[]} */
    const stack = [];
    let currentActive = true;

    const lines = source.split(/\r?\n/);
    const output = [];

    /**
     * @param {string} name
     * @returns {boolean}
     */
    const isDefined = (name) => macros.has(name);

    /**
     * @param {string} expr
     * @returns {string[]}
     */
    const tokenize = (expr) => {
        const tokens = [];
        let i = 0;
        while (i < expr.length) {
            const ch = expr[i];
            if (/\s/.test(ch)) {
                i += 1;
                continue;
            }
            if (ch === "(" || ch === ")") {
                tokens.push(ch);
                i += 1;
                continue;
            }
            if (expr.startsWith("||", i) || expr.startsWith("&&", i)) {
                tokens.push(expr.slice(i, i + 2));
                i += 2;
                continue;
            }
            if (ch === "!") {
                tokens.push("!");
                i += 1;
                continue;
            }
            // identifiers or defined(...)
            const match = expr.slice(i).match(/^[A-Za-z0-9_]+/);
            if (match) {
                tokens.push(match[0]);
                i += match[0].length;
                continue;
            }
            // defined(...)
            if (expr.startsWith("defined", i)) {
                tokens.push("defined");
                i += "defined".length;
                continue;
            }
            tokens.push(ch);
            i += 1;
        }
        return tokens;
    };

    /**
     * @param {string[]} tokens
     * @param {{ i: number }} state
     * @returns {boolean}
     */
    const parsePrimary = (tokens, state) => {
        const token = tokens[state.i];
        if (token === "!") {
            state.i += 1;
            return !parsePrimary(tokens, state);
        }
        if (token === "(") {
            state.i += 1;
            const value = parseOr(tokens, state);
            if (tokens[state.i] !== ")") {
                return false;
            }
            state.i += 1;
            return value;
        }
        if (token === "defined") {
            state.i += 1;
            if (tokens[state.i] === "(") {
                state.i += 1;
            }
            const name = tokens[state.i];
            state.i += 1;
            if (tokens[state.i] === ")") {
                state.i += 1;
            }
            return isDefined(name);
        }
        if (token === "0") {
            state.i += 1;
            return false;
        }
        if (token === "1") {
            state.i += 1;
            return true;
        }
        if (typeof token === "string" && isDefined(token)) {
            state.i += 1;
            return macros.get(token) !== "0";
        }
        state.i += 1;
        return false;
    };

    /**
     * @param {string[]} tokens
     * @param {{ i: number }} state
     * @returns {boolean}
     */
    const parseAnd = (tokens, state) => {
        let value = parsePrimary(tokens, state);
        while (tokens[state.i] === "&&") {
            state.i += 1;
            value = value && parsePrimary(tokens, state);
        }
        return value;
    };

    /**
     * @param {string[]} tokens
     * @param {{ i: number }} state
     * @returns {boolean}
     */
    const parseOr = (tokens, state) => {
        let value = parseAnd(tokens, state);
        while (tokens[state.i] === "||") {
            state.i += 1;
            value = value || parseAnd(tokens, state);
        }
        return value;
    };

    /**
     * @param {string} expr
     * @returns {boolean}
     */
    const evalExpr = (expr) => {
        const trimmed = expr.trim();
        if (!trimmed) {
            return false;
        }
        const tokens = tokenize(trimmed);
        const state = { i: 0 };
        return parseOr(tokens, state);
    };

    /**
     * @param {boolean} condition
     * @returns {void}
     */
    const beginConditional = (condition) => {
        const parentActive = currentActive;
        const active = parentActive && condition;
        stack.push({ parentActive, active, anyTrue: active });
        currentActive = active;
    };

    /**
     * @param {boolean} condition
     * @returns {void}
     */
    const handleElif = (condition) => {
        const frame = stack[stack.length - 1];
        if (!frame.parentActive) {
            frame.active = false;
            currentActive = false;
            return;
        }
        if (frame.anyTrue) {
            frame.active = false;
        } else {
            frame.active = condition;
            frame.anyTrue = condition;
        }
        currentActive = frame.active;
    };

    /**
     * @returns {void}
     */
    const handleElse = () => {
        const frame = stack[stack.length - 1];
        if (!frame.parentActive) {
            frame.active = false;
        } else {
            frame.active = !frame.anyTrue;
            frame.anyTrue = true;
        }
        currentActive = frame.active;
    };

    /**
     * @returns {void}
     */
    const handleEndif = () => {
        stack.pop();
        currentActive = stack.length ? stack[stack.length - 1].active : true;
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("#")) {
            if (currentActive) {
                output.push(line);
            }
            continue;
        }

        const directive = trimmed.split(/\s+/)[0];
        const rest = trimmed.slice(directive.length).trim();

        switch (directive) {
            case "#define": {
                if (currentActive) {
                    const [name, ...valueParts] = rest.split(/\s+/);
                    const value = valueParts.join(" ") || "1";
                    if (name) {
                        macros.set(name, value);
                    }
                }
                break;
            }
            case "#undef": {
                if (currentActive) {
                    macros.delete(rest);
                }
                break;
            }
            case "#ifdef":
                beginConditional(isDefined(rest));
                break;
            case "#ifndef":
                beginConditional(!isDefined(rest));
                break;
            case "#if":
                beginConditional(evalExpr(rest));
                break;
            case "#elif":
                handleElif(evalExpr(rest));
                break;
            case "#else":
                handleElse();
                break;
            case "#endif":
                handleEndif();
                break;
            default:
                if (currentActive) {
                    output.push(line);
                }
                break;
        }
    }

    return output.join("\n");
}
