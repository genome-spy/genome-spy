/**
 * Remove inactive shader-local conditional blocks.
 *
 * Supported syntax is deliberately limited to `#if`, `#else`, and `#endif`.
 * Conditions may combine `defined(NAME)` terms with `!`, `&&`, `||`, and
 * parentheses.
 *
 * @param {string} source
 * @param {ReadonlySet<string>} definedSymbols
 * @returns {string}
 */
export function evaluateShaderConditionals(source, definedSymbols) {
    /** @type {{ parentActive: boolean, condition: boolean, elseSeen: boolean }[]} */
    const stack = [];
    let active = true;
    const output = [];

    for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("#")) {
            if (active) {
                output.push(line);
            }
            continue;
        }

        const match = trimmed.match(/^#([A-Za-z]+)\b(.*)$/);
        if (!match) {
            throw shaderConditionalError(lineIndex, "Malformed directive");
        }
        const [, directive, rest] = match;
        const argument = rest.trim();

        if (directive === "if") {
            const condition = evaluateCondition(argument, definedSymbols);
            stack.push({
                parentActive: active,
                condition,
                elseSeen: false,
            });
            active = active && condition;
        } else if (directive === "else") {
            if (argument) {
                throw shaderConditionalError(
                    lineIndex,
                    "#else does not accept an argument"
                );
            }
            const frame = stack.at(-1);
            if (!frame) {
                throw shaderConditionalError(
                    lineIndex,
                    "#else has no matching #if"
                );
            }
            if (frame.elseSeen) {
                throw shaderConditionalError(
                    lineIndex,
                    "#if block contains more than one #else"
                );
            }
            frame.elseSeen = true;
            active = frame.parentActive && !frame.condition;
        } else if (directive === "endif") {
            if (argument) {
                throw shaderConditionalError(
                    lineIndex,
                    "#endif does not accept an argument"
                );
            }
            const frame = stack.pop();
            if (!frame) {
                throw shaderConditionalError(
                    lineIndex,
                    "#endif has no matching #if"
                );
            }
            active = frame.parentActive;
        } else {
            throw shaderConditionalError(
                lineIndex,
                `Unsupported directive #${directive}`
            );
        }
    }

    if (stack.length) {
        throw new Error("Unterminated shader #if block.");
    }

    return output.join("\n");
}

/**
 * @param {string} expression
 * @param {ReadonlySet<string>} definedSymbols
 * @returns {boolean}
 */
function evaluateCondition(expression, definedSymbols) {
    const tokens = tokenize(expression);
    let index = 0;

    const peek = () => tokens[index];
    const consume = () => tokens[index++];

    /** @returns {boolean} */
    function parsePrimary() {
        if (peek() === "!") {
            consume();
            return !parsePrimary();
        }
        if (peek() === "(") {
            consume();
            const value = parseOr();
            if (consume() !== ")") {
                throw new Error('Expected ")" in shader condition.');
            }
            return value;
        }
        if (consume() !== "defined" || consume() !== "(") {
            throw new Error("Expected defined(NAME) in shader condition.");
        }
        const name = consume();
        if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            throw new Error("Expected a symbol name in defined(NAME).");
        }
        if (consume() !== ")") {
            throw new Error('Expected ")" after shader symbol name.');
        }
        return definedSymbols.has(name);
    }

    /** @returns {boolean} */
    function parseAnd() {
        let value = parsePrimary();
        while (peek() === "&&") {
            consume();
            const right = parsePrimary();
            value = value && right;
        }
        return value;
    }

    /** @returns {boolean} */
    function parseOr() {
        let value = parseAnd();
        while (peek() === "||") {
            consume();
            const right = parseAnd();
            value = value || right;
        }
        return value;
    }

    if (!tokens.length) {
        throw new Error("Shader #if requires a condition.");
    }
    const value = parseOr();
    if (index !== tokens.length) {
        throw new Error(
            `Unexpected token "${tokens[index]}" in shader condition.`
        );
    }
    return value;
}

/**
 * @param {string} expression
 * @returns {string[]}
 */
function tokenize(expression) {
    const tokens = [];
    const pattern = /defined|[A-Za-z_][A-Za-z0-9_]*|&&|\|\||!|\(|\)/gy;
    let index = 0;
    while (index < expression.length) {
        if (/\s/.test(expression[index])) {
            index += 1;
            continue;
        }
        pattern.lastIndex = index;
        const match = pattern.exec(expression);
        if (!match) {
            throw new Error(
                `Unexpected token near "${expression.slice(index)}" in shader condition.`
            );
        }
        tokens.push(match[0]);
        index = pattern.lastIndex;
    }
    return tokens;
}

/**
 * @param {number} lineIndex
 * @param {string} message
 * @returns {Error}
 */
function shaderConditionalError(lineIndex, message) {
    return new Error(`${message} at shader line ${lineIndex + 1}.`);
}
