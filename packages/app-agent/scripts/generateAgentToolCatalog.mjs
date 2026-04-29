/* global console, process */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { formatGeneratedSource } from "./formatGeneratedSource.mjs";
import {
    firstSentence,
    parseExamples,
    readJsDoc,
} from "./generateAgentCatalogDocHelpers.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "..");

// The documented tool inputs in src/agent/agentToolInputs.d.ts drive the
// generated catalog that the app consumes at runtime.
const toolInputsPath = path.join(
    packageDir,
    "src",
    "agent",
    "agentToolInputs.d.ts"
);
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generated",
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
 * @param {ts.SourceFile} sourceFile
 * @returns {Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>}
 */
function getInterfaceNodes(sourceFile) {
    /** @type {Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>} */
    const interfaces = new Map();

    for (const statement of sourceFile.statements) {
        if (
            ts.isInterfaceDeclaration(statement) ||
            ts.isTypeAliasDeclaration(statement)
        ) {
            interfaces.set(statement.name.text, statement);
        }
    }

    return interfaces;
}

/**
 * @param {string} name
 * @param {Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>} interfaces
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

    if (!ts.isInterfaceDeclaration(node)) {
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
    const toolSource = await loadSourceFile(toolInputsPath, ts.ScriptKind.TS);
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
            inputFields: ts.isInterfaceDeclaration(inputNode)
                ? collectInterfaceFields(inputType, interfaces, toolSource)
                : [],
            exampleInput,
            strict: toolName !== "submitIntentActions",
        });
    }

    return generatedToolCatalog;
}

/**
 * @param {import("../src/agent/types.js").AgentToolCatalogEntry[]} generatedToolCatalog
 * @returns {string}
 */
export async function renderGeneratedToolCatalog(generatedToolCatalog) {
    return formatGeneratedSource(
        JSON.stringify(generatedToolCatalog, null, 2) + "\n",
        outputPath
    );
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
