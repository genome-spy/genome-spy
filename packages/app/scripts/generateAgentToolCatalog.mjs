import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "..");

const toolSchemaContractPath = path.join(
    packageDir,
    "src",
    "agent",
    "toolSchemaContract.ts"
);
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generatedToolCatalog.json"
);

/**
 * @param {string} filePath
 * @param {ts.ScriptKind} scriptKind
 * @returns {Promise<ts.SourceFile>}
 */
async function loadSourceFile(filePath, scriptKind) {
    const text = await readFile(filePath, "utf8");
    return ts.createSourceFile(
        filePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
    );
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeDocText(text) {
    return String(text ?? "")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.replace(/\s+$/g, ""))
        .join("\n")
        .trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
function compactDocText(text) {
    return normalizeDocText(text).replace(/\s+/g, " ");
}

/**
 * @param {string} text
 * @returns {string}
 */
function firstSentence(text) {
    const normalized = normalizeDocText(text);
    if (!normalized) {
        return "";
    }

    const match = normalized.match(/^(.+?[.!?])(?:\s|$)/s);
    if (match) {
        return compactDocText(match[1]);
    }

    return compactDocText(normalized.split(/\n\s*\n/)[0]);
}

/**
 * @param {ts.Node} node
 * @returns {{ summary: string, tags: Array<{ name: string, comment: string }> }}
 */
function readJsDoc(node) {
    const doc = node.jsDoc?.[0];
    const summary = compactDocText(doc?.comment ?? "");
    const tags = (doc?.tags ?? []).map((tag) => ({
        name: tag.tagName.getText(),
        comment: normalizeDocText(tag.comment ?? ""),
    }));

    return { summary, tags };
}

/**
 * @param {Array<{ name: string, comment: string }>} tags
 * @returns {string[]}
 */
function parseExamples(tags) {
    const examples = [];
    for (const tag of tags) {
        if (tag.name !== "example") {
            continue;
        }

        const exampleText = tag.comment.trim();
        if (!exampleText) {
            continue;
        }

        try {
            examples.push(JSON.parse(exampleText));
        } catch {
            throw new Error(
                "Could not parse @example JSON block:\n" + exampleText
            );
        }
    }

    return examples;
}

/**
 * @param {ts.SourceFile} sourceFile
 * @returns {Map<string, ts.InterfaceDeclaration>}
 */
function getInterfaceNodes(sourceFile) {
    /** @type {Map<string, ts.InterfaceDeclaration>} */
    const interfaces = new Map();

    for (const statement of sourceFile.statements) {
        if (ts.isInterfaceDeclaration(statement)) {
            interfaces.set(statement.name.text, statement);
        }
    }

    return interfaces;
}

/**
 * @param {string} name
 * @param {Map<string, ts.InterfaceDeclaration>} interfaces
 * @param {ts.SourceFile} sourceFile
 * @param {Set<string>} [visited]
 * @returns {import("../src/agent/types.js").AgentPayloadField[]}
 */
function collectInterfaceFields(name, interfaces, sourceFile, visited = new Set()) {
    if (visited.has(name)) {
        return [];
    }
    visited.add(name);

    const node = interfaces.get(name);
    if (!node) {
        return [];
    }

    /** @type {Map<string, import("../src/agent/types.js").AgentPayloadField>} */
    const fields = new Map();

    for (const heritageClause of node.heritageClauses ?? []) {
        for (const heritageType of heritageClause.types) {
            const baseName = heritageType.expression.getText(sourceFile);
            for (const field of collectInterfaceFields(
                baseName,
                interfaces,
                sourceFile,
                visited
            )) {
                if (!fields.has(field.name)) {
                    fields.set(field.name, field);
                }
            }
        }
    }

    for (const member of node.members) {
        if (!ts.isPropertySignature(member)) {
            continue;
        }

        const fieldName = member.name.getText(sourceFile);
        const { summary } = readJsDoc(member);
        fields.set(fieldName, {
            name: fieldName,
            type: member.type ? member.type.getText(sourceFile) : "any",
            description: summary,
            required: !member.questionToken,
        });
    }

    return Array.from(fields.values());
}

/**
 * @param {ts.SourceFile} sourceFile
 * @returns {ts.InterfaceDeclaration}
 */
function getToolInputsInterface(sourceFile) {
    for (const statement of sourceFile.statements) {
        if (
            ts.isInterfaceDeclaration(statement) &&
            statement.name.text === "AgentToolInputs"
        ) {
            return statement;
        }
    }

    throw new Error("Cannot find AgentToolInputs interface.");
}

/**
 * @param {ts.SourceFile} sourceFile
 * @returns {Promise<import("../src/agent/types.js").AgentToolCatalogEntry[]>}
 */
export async function createGeneratedToolCatalog() {
    const toolSource = await loadSourceFile(
        toolSchemaContractPath,
        ts.ScriptKind.TS
    );
    const interfaces = getInterfaceNodes(toolSource);
    const toolInputsInterface = getToolInputsInterface(toolSource);

    /** @type {import("../src/agent/types.js").AgentToolCatalogEntry[]} */
    const generatedToolCatalog = [];

    for (const member of toolInputsInterface.members) {
        if (!ts.isPropertySignature(member)) {
            continue;
        }

        const toolName = member.name.getText(toolSource);
        const inputType = member.type?.getText(toolSource);
        if (!inputType) {
            throw new Error("Tool input type is missing for " + toolName + ".");
        }

        const inputNode = interfaces.get(inputType);
        if (!inputNode) {
            throw new Error(
                "Cannot find tool input documentation for " + inputType + "."
            );
        }

        const { summary, tags } = readJsDoc(inputNode);
        const exampleInput = parseExamples(tags)[0] ?? {};

        generatedToolCatalog.push({
            toolName,
            description: firstSentence(summary) || summary,
            inputType,
            inputFields: collectInterfaceFields(
                inputType,
                interfaces,
                toolSource
            ),
            exampleInput,
            strict: toolName !== "submitIntentProgram",
        });
    }

    return generatedToolCatalog;
}

/**
 * @param {import("../src/agent/types.js").AgentToolCatalogEntry[]} generatedToolCatalog
 * @returns {string}
 */
export async function renderGeneratedToolCatalog(generatedToolCatalog) {
    return JSON.stringify(generatedToolCatalog, null, 2) + "\n";
}

/**
 * @returns {Promise<void>}
 */
export async function writeGeneratedToolCatalog() {
    const generatedToolCatalog = await createGeneratedToolCatalog();
    const output = await renderGeneratedToolCatalog(generatedToolCatalog);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output);

    console.log("Wrote " + path.relative(repoRoot, outputPath));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    await writeGeneratedToolCatalog();
}
