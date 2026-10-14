/**
 * @typedef {{location: import("@genome-spy/core/types/embedApi.js").SpecLocation, message: string}} LocatedSpecError
 * @typedef {{loadingEntries: readonly import("@genome-spy/core/types/embedApi.js").DataLoadingEntry[], specError?: LocatedSpecError}} RuntimeDiagnostics
 */

/**
 * Indexes the authored JSON object graph before runtime normalization or mutation.
 * Origins identify fragments in this editor document, not runtime tree positions.
 *
 * @param {object} spec
 */
export function indexSpecOrigins(spec) {
    /** @type {WeakMap<object, string>} */
    const origins = new WeakMap();
    /** @param {unknown} value @param {string} pointer */
    function visit(value, pointer) {
        if (value === null || typeof value !== "object") return;
        origins.set(value, pointer);
        for (const [key, child] of Object.entries(
            /** @type {Record<string, unknown>} */ (value)
        )) {
            visit(
                child,
                pointer + "/" + key.replaceAll("~", "~0").replaceAll("/", "~1")
            );
        }
    }
    visit(spec, "");
    return origins;
}

/**
 * Resolves runtime errors against the same JSON AST used for schema diagnostics.
 * A located processing error identifies its field or expression declaration.
 * Only a confirmed request failure on a single eager URL identifies that URL;
 * processing, lists, and ambiguous lazy data/index failures identify the data config.
 *
 * @param {import("vscode-json-languageservice").ASTNode | undefined} root
 * @param {readonly import("@genome-spy/core/types/embedApi.js").DataLoadingEntry[]} entries
 */
export function resolveLoadingDiagnostics(root, entries) {
    const diagnostics = [];
    for (const entry of entries) {
        if (entry.status !== "error") continue;
        const located =
            entry.errorLocation &&
            resolveSpecErrorDiagnostic(root, {
                location: entry.errorLocation,
                message: entry.message ?? "Data processing failed.",
            });
        if (located) {
            diagnostics.push(located);
            continue;
        }
        if (entry.origin === undefined) continue;
        const data = resolvePointer(root, entry.origin);
        if (!data) continue;

        const url = propertyValue(data, "url");
        const node =
            entry.errorPhase === "request" && url?.type === "string"
                ? url
                : data;
        diagnostics.push({
            from: node.offset,
            to: node.offset + node.length,
            message: entry.message ?? "Data loading failed.",
        });
    }
    return diagnostics;
}

/**
 * @param {import("vscode-json-languageservice").ASTNode | undefined} root
 * @param {LocatedSpecError | undefined} error
 */
export function resolveSpecErrorDiagnostic(root, error) {
    if (!error) return;
    const node = resolvePath(
        resolvePointer(root, error.location.origin),
        error.location.path ?? []
    );
    if (!node) return;
    return {
        from: node.offset,
        to: node.offset + node.length,
        message: error.message,
    };
}

/**
 * @param {import("vscode-json-languageservice").ASTNode | undefined} root
 * @param {RuntimeDiagnostics} runtime
 */
export function resolveRuntimeDiagnostics(root, runtime) {
    const diagnostics = resolveLoadingDiagnostics(root, runtime.loadingEntries);
    const located = resolveSpecErrorDiagnostic(root, runtime.specError);
    // A downstream error can reach both the source report and onError.
    if (
        located &&
        !diagnostics.some(
            ({ from, to }) => from === located.from && to === located.to
        )
    )
        diagnostics.push(located);
    return diagnostics;
}

/**
 * @param {import("vscode-json-languageservice").ASTNode | undefined} node
 * @param {string} pointer
 */
function resolvePointer(node, pointer) {
    if (pointer === "") return node;
    if (!pointer.startsWith("/")) return;
    return resolvePath(
        node,
        pointer
            .slice(1)
            .split("/")
            .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
    );
}

/**
 * @param {import("vscode-json-languageservice").ASTNode | undefined} node
 * @param {readonly (string | number)[]} path
 */
function resolvePath(node, path) {
    for (const key of path) {
        node =
            node?.type === "array"
                ? node.items[Number(key)]
                : propertyValue(node, String(key));
        if (!node) return;
    }
    return node;
}

/**
 * @param {import("vscode-json-languageservice").ASTNode | undefined} node
 * @param {string} key
 */
function propertyValue(node, key) {
    return node?.type === "object"
        ? node.properties.find((property) => property.keyNode.value === key)
              ?.valueNode
        : undefined;
}
