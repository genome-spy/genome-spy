/**
 * @param {string} name
 * @param {(dependency: any) => void} setter
 */
export function queryDependency(name, setter) {
    return new CustomEvent("query-dependency", {
        detail: { name, setter },
        bubbles: true,
    });
}
