/// <reference lib="webworker" />

/**
 * Runs JSON parsing and GenomeSpy schema queries outside the UI thread. The
 * language service implements JSON Schema behavior that CodeMirror does not
 * include, while the worker keeps validation and completion responsive.
 *
 * Based on the public API and sample usage documented by Microsoft's JSON
 * language service: https://github.com/microsoft/vscode-json-languageservice
 */

import schema from "@genome-spy/core/schema.json";
import corePackage from "../../../core/package.json" with { type: "json" };
import { getLanguageService, TextDocument } from "vscode-json-languageservice";
import { createSchemaRequestService } from "./schemaRequestService.js";

const SPEC_URI = "inmemory://genome-spy/spec.json";
const DEFAULT_SCHEMA_URI = "inmemory://genome-spy/core-schema.json";

const languageService = getLanguageService({
    schemaRequestService: createSchemaRequestService(
        schema,
        corePackage.version
    ),
});
languageService.configure({
    validate: true,
    allowComments: false,
    schemas: [
        {
            uri: DEFAULT_SCHEMA_URI,
            fileMatch: ["*"],
            schema,
        },
    ],
});

const workerScope = /** @type {DedicatedWorkerGlobalScope} */ (
    /** @type {unknown} */ (self)
);

/**
 * @param {string} text
 * @param {number} version
 */
function createDocument(text, version) {
    return TextDocument.create(SPEC_URI, "json", version, text);
}

workerScope.addEventListener("message", async (event) => {
    const { id, type, text, offset } = event.data;
    const document = createDocument(text, id);
    const jsonDocument = languageService.parseJSONDocument(document);

    try {
        let result;

        switch (type) {
            case "validate":
                result = await languageService.doValidation(
                    document,
                    jsonDocument,
                    {
                        comments: "error",
                        trailingCommas: "error",
                        schemaValidation: "error",
                        schemaRequest: "error",
                    }
                );
                break;
            case "complete":
                result = await languageService.doComplete(
                    document,
                    document.positionAt(offset),
                    jsonDocument
                );
                break;
            case "hover":
                result = await languageService.doHover(
                    document,
                    document.positionAt(offset),
                    jsonDocument
                );
                break;
            default:
                throw new Error("Unknown JSON language request: " + type);
        }

        workerScope.postMessage({ id, result });
    } catch (error) {
        workerScope.postMessage({
            id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
