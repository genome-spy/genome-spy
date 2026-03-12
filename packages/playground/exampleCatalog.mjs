import fs from "fs";
import path from "path";

const CURATED_GROUPS = ["docs", "core", "app"];

/**
 * @param {string} examplesDir
 * @param {string} specUrlRoot
 */
export function generateExampleCatalog(examplesDir, specUrlRoot) {
    /** @type {ReturnType<typeof createCatalogEntry>[]} */
    const entries = [];

    for (const group of CURATED_GROUPS) {
        const groupDir = path.join(examplesDir, group);
        if (!fs.existsSync(groupDir)) {
            continue;
        }

        visit(groupDir, (absolutePath) => {
            const relativePath = path
                .relative(examplesDir, absolutePath)
                .split(path.sep)
                .join("/");
            const spec = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
            entries.push(
                createCatalogEntry(absolutePath, relativePath, specUrlRoot, spec)
            );
        });
    }

    return entries.sort(compareEntries);
}

/**
 * @param {string} dir
 * @param {(absolutePath: string) => void} visitor
 */
function visit(dir, visitor) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            visit(absolutePath, visitor);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            visitor(absolutePath);
        }
    }
}

/**
 * @param {string} absolutePath
 * @param {string} relativePath
 * @param {string} specUrlRoot
 * @param {{ description?: string | string[] }} spec
 */
function createCatalogEntry(absolutePath, relativePath, specUrlRoot, spec) {
    const specPath = `examples/${relativePath}`;
    const pathSegments = relativePath.split("/");
    const sourceGroup = pathSegments[0];
    const categorySegments = trimTrailingIndex(pathSegments.slice(1, -1));
    const title = getCatalogTitle(spec.description, pathSegments.at(-1));
    const screenshotPath = specPath.replace(/\.json$/, ".png");
    const hasScreenshot = fs.existsSync(absolutePath.replace(/\.json$/, ".png"));

    return {
        id: relativePath.replace(/\.json$/, ""),
        title,
        description: normalizeDescription(spec.description),
        sourceGroup,
        sourceLabel: humanizeSegment(sourceGroup),
        category: categorySegments.length
            ? categorySegments.map(humanizeSegment).join(" / ")
            : "General",
        specPath,
        specUrl: `${specUrlRoot}/${relativePath}`,
        screenshotPath: hasScreenshot ? screenshotPath : null,
        screenshotUrl: hasScreenshot
            ? `${specUrlRoot}/${relativePath.replace(/\.json$/, ".png")}`
            : null,
        sourceMode: "shared-example",
    };
}

/**
 * @param {{ sourceGroup: string, category: string, title: string }} a
 * @param {{ sourceGroup: string, category: string, title: string }} b
 */
function compareEntries(a, b) {
    return (
        compareGroupOrder(a.sourceGroup, b.sourceGroup) ||
        compareStrings(a.category, b.category) ||
        compareStrings(a.title, b.title)
    );
}

/**
 * @param {string} a
 * @param {string} b
 */
function compareGroupOrder(a, b) {
    return CURATED_GROUPS.indexOf(a) - CURATED_GROUPS.indexOf(b);
}

/**
 * @param {string} a
 * @param {string} b
 */
function compareStrings(a, b) {
    return a.localeCompare(b);
}

/**
 * @param {string | string[] | undefined} description
 */
function normalizeDescription(description) {
    if (Array.isArray(description)) {
        return description.join(" ");
    } else if (typeof description === "string") {
        return description;
    } else {
        return "";
    }
}

/**
 * @param {string | string[] | undefined} description
 * @param {string | undefined} fileName
 */
function getCatalogTitle(description, fileName) {
    if (Array.isArray(description)) {
        const firstLine = description.find(
            (line) => typeof line === "string" && line.trim().length > 0
        );
        if (firstLine) {
            return firstLine;
        }
    } else if (typeof description === "string" && description.trim().length > 0) {
        return description;
    }

    return humanizeSegment((fileName || "example").replace(/\.json$/, ""));
}

/**
 * @param {string} segment
 */
function humanizeSegment(segment) {
    return segment
        .split("-")
        .map((part) =>
            part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part
        )
        .join(" ");
}

/**
 * @param {string[]} segments
 */
function trimTrailingIndex(segments) {
    return segments.at(-1) === "index" ? segments.slice(0, -1) : segments;
}
