import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { supplementalActionCatalogEntries } from "../src/agent/actionCatalogDefinitions.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "..");

const sampleSlicePath = path.join(
    packageDir,
    "src",
    "sampleView",
    "state",
    "sampleSlice.js"
);
const payloadTypesPath = path.join(
    packageDir,
    "src",
    "sampleView",
    "state",
    "payloadTypes.d.ts"
);
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generatedActionCatalog.json"
);

const SAMPLE_SLICE_PREFIX = "sampleView/";

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
 * @returns {Record<string, string>}
 */
function parseAgentTags(tags) {
    /** @type {Record<string, string>} */
    const result = {};
    for (const tag of tags) {
        if (tag.name !== "agent") {
            continue;
        }

        const match = tag.comment.match(/^\.([A-Za-z0-9_]+)\s*(.*)$/s);
        if (!match) {
            continue;
        }

        result[match[1]] = match[2].trim();
    }

    return result;
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
 * @returns {Map<string, ts.PropertyAssignment>}
 */
function getReducerNodes(sourceFile) {
    /** @type {Map<string, ts.PropertyAssignment>} */
    const reducers = new Map();

    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }

        for (const declaration of statement.declarationList.declarations) {
            if (declaration.name.getText(sourceFile) !== "sampleSlice") {
                continue;
            }

            const initializer = declaration.initializer;
            if (!initializer || !ts.isCallExpression(initializer)) {
                continue;
            }

            const createSliceArg = initializer.arguments[0];
            if (!createSliceArg || !ts.isObjectLiteralExpression(createSliceArg)) {
                continue;
            }

            const reducersProperty = createSliceArg.properties.find(
                (property) =>
                    ts.isPropertyAssignment(property) &&
                    property.name.getText(sourceFile) === "reducers"
            );
            if (
                !reducersProperty ||
                !ts.isPropertyAssignment(reducersProperty) ||
                !ts.isObjectLiteralExpression(reducersProperty.initializer)
            ) {
                continue;
            }

            for (const property of reducersProperty.initializer.properties) {
                if (!ts.isPropertyAssignment(property)) {
                    continue;
                }

                const name = property.name.getText(sourceFile);
                reducers.set(name, property);
            }
        }
    }

    return reducers;
}

/**
 * @typedef {object} PayloadFieldDoc
 * @property {string} name
 * @property {string} type
 * @property {string} description
 * @property {boolean} required
 */

/**
 * @typedef {object} PayloadTypeDoc
 * @property {string} description
 * @property {PayloadFieldDoc[]} fields
 */

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
 * @returns {PayloadFieldDoc[]}
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

    /** @type {Map<string, PayloadFieldDoc>} */
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
        if (fieldName.startsWith("_")) {
            continue;
        }

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
 * @returns {Map<string, PayloadTypeDoc>}
 */
function getPayloadTypeDocs(sourceFile) {
    const interfaces = getInterfaceNodes(sourceFile);
    /** @type {Map<string, PayloadTypeDoc>} */
    const docs = new Map();

    for (const [name, node] of interfaces.entries()) {
        const { summary } = readJsDoc(node);
        docs.set(name, {
            description: summary,
            fields: collectInterfaceFields(name, interfaces, sourceFile),
        });
    }

    return docs;
}

/**
 * @param {string} actionType
 * @returns {string}
 */
function inferPayloadType(actionType) {
    return actionType.charAt(0).toUpperCase() + actionType.slice(1);
}

/**
 * @param {string} actionType
 * @returns {string}
 */
function getSampleActionName(actionType) {
    if (!actionType.startsWith(SAMPLE_SLICE_PREFIX)) {
        throw new Error("Not a sample action type: " + actionType);
    }

    return actionType.slice(SAMPLE_SLICE_PREFIX.length);
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeActionDescription(text) {
    return firstSentence(text) || text;
}

/**
 * @param {string} actionType
 * @param {ts.PropertyAssignment} node
 * @param {Map<string, PayloadTypeDoc>} payloadTypeDocs
 * @returns {Record<string, any>}
 */
function buildEntry(actionType, node, payloadTypeDocs) {
    const { summary, tags } = readJsDoc(node);
    const agentTags = parseAgentTags(tags);
    const examplePayload = parseExamples(tags)[0] ?? {};
    const localActionName = getSampleActionName(actionType);
    const payloadType =
        agentTags.payloadType || inferPayloadType(localActionName);
    const payloadTypeDoc = payloadTypeDocs.get(payloadType);

    if (!payloadTypeDoc) {
        throw new Error(
            "Cannot find payload type documentation for " + payloadType
        );
    }

    return {
        actionType,
        description: normalizeActionDescription(summary),
        payloadType,
        payloadDescription:
            payloadTypeDoc.description || normalizeActionDescription(summary),
        payloadFields: payloadTypeDoc.fields,
        examplePayload,
    };
}

/**
 * @returns {Promise<import("./types.js").AgentActionCatalogEntry[]>}
 */
export async function createGeneratedActionCatalog() {
    const [sampleSliceSource, payloadTypesSource] = await Promise.all([
        loadSourceFile(sampleSlicePath, ts.ScriptKind.JS),
        loadSourceFile(payloadTypesPath, ts.ScriptKind.TS),
    ]);

    const reducerNodes = getReducerNodes(sampleSliceSource);
    const payloadTypeDocs = getPayloadTypeDocs(payloadTypesSource);
    const supplementalEntriesByActionType = new Map(
        supplementalActionCatalogEntries.map((entry) => [entry.actionType, entry])
    );

    /** @type {import("./types.js").AgentActionCatalogEntry[]} */
    const generatedActionCatalog = [];
    for (const [reducerName, reducerNode] of reducerNodes) {
        const { tags } = readJsDoc(reducerNode);
        const agentTags = parseAgentTags(tags);
        if (agentTags.category === "initialization") {
            continue;
        }

        generatedActionCatalog.push(
            /** @type {import("./types.js").AgentActionCatalogEntry} */ (
                buildEntry(
                    `${SAMPLE_SLICE_PREFIX}${reducerName}`,
                    reducerNode,
                    payloadTypeDocs
                )
            )
        );
    }

    for (const actionType of supplementalEntriesByActionType.keys()) {
        const supplementalEntry =
            supplementalEntriesByActionType.get(actionType);
        if (!supplementalEntry) {
            throw new Error(
                "Cannot find supplemental action catalog entry for " +
                    actionType
            );
        }

        generatedActionCatalog.push(
            /** @type {import("./types.js").AgentActionCatalogEntry} */ ({
                ...supplementalEntry,
            })
        );
    }

    return generatedActionCatalog;
}

/**
 * @param {import("./types.js").AgentActionCatalogEntry[]} generatedActionCatalog
 * @returns {string}
 */
export async function renderGeneratedActionCatalog(generatedActionCatalog) {
    return JSON.stringify(generatedActionCatalog, null, 2) + "\n";
}

/**
 * @returns {Promise<void>}
 */
export async function writeGeneratedActionCatalog() {
    const generatedActionCatalog = await createGeneratedActionCatalog();
    const output = await renderGeneratedActionCatalog(generatedActionCatalog);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output);

    console.log("Wrote " + path.relative(repoRoot, outputPath));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    await writeGeneratedActionCatalog();
}
