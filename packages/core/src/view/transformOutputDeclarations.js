/**
 * Branch declarations share their owning view's lexical scope.
 * @param {import("../spec/transform.js").TransformParams[]} transforms
 * @returns {Generator<{
 *   transform: import("../spec/transform.js").TransformParams,
 *   property: "param" | "domainParam",
 *   param: import("../spec/transform.js").TransformOutput
 * }>}
 */
export function* getOutputDeclarations(transforms) {
    for (const transform of transforms) {
        if (transform.type === "values") {
            yield { transform, property: "param", param: transform.param };
        } else if (
            transform.type === "dendrogram" &&
            transform.domainParam !== undefined
        ) {
            yield {
                transform,
                property: "domainParam",
                param: transform.domainParam,
            };
        } else if (transform.type === "branch") {
            yield* getOutputDeclarations(transform.transform);
        }
    }
}

/** @param {import("./view.js").default} root */
export function finalizeOutputDeclarations(root) {
    root.visit((view) => {
        view.paramRuntime.finalizeOutputDeclarations();
    });
}
