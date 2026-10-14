import fs from "fs";
import path from "path";
import { URL } from "node:url";

const CURATED_GROUPS = ["docs", "core", "app"];

/**
 * @param {string} examplesDir
 * @param {string} specUrlRoot
 * @param {string} docsDir
 */
export function generateExampleCatalog(examplesDir, specUrlRoot, docsDir) {
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
                createCatalogEntry(
                    absolutePath,
                    relativePath,
                    specUrlRoot,
                    spec
                )
            );
        });
    }

    addDocumentationReferences(entries, docsDir);
    return entries.sort(compareEntries);
}

/**
 * Index live embeds rather than gallery navigation or inferred directory names.
 *
 * @param {ReturnType<typeof createCatalogEntry>[]} entries
 * @param {string} docsDir
 */
function addDocumentationReferences(entries, docsDir) {
    const bySpecPath = new Map(entries.map((entry) => [entry.specPath, entry]));
    /** @type {string[]} */
    const pages = [];
    visit(
        docsDir,
        (absolutePath) => pages.push(path.relative(docsDir, absolutePath)),
        ".md"
    );

    for (const page of pages.sort()) {
        const pagePath = page.split(path.sep).join("/");
        if (/^(?:app|example-specs|generated-snippets)\//.test(pagePath)) {
            continue;
        }
        const markdown = fs.readFileSync(path.join(docsDir, page), "utf8");
        const frontmatter = markdown.match(
            /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
        );
        const body = frontmatter
            ? markdown.slice(frontmatter[0].length)
            : markdown;
        const lines = getUnfencedLines(body);
        const heading = lines.find((line) => /^#\s+/.test(line));
        const title = heading
            ? heading.replace(/^#\s+|\s+#+\s*$/g, "").trim()
            : (frontmatter?.[1]
                  .match(/^title:\s*(.+)$/m)?.[1]
                  .replace(/^['"]|['"]$/g, "") ??
              humanizeSegment(path.basename(page, ".md")));
        const pageUrl = new URL(
            pagePath
                .replace(/(?:^|\/)index\.md$/, "/")
                .replace(/\.md$/, "/")
                .replace(/^\//, ""),
            "https://genomespy.app/docs/"
        );
        // Explicit IDs are reserved before automatic heading IDs are assigned.
        const usedIds = new Set(
            lines
                .filter((line) => /^#{1,6}\s+/.test(line))
                .flatMap(
                    (line) =>
                        line.match(/\{[^}]*#([^\s}]+)[^}]*\}\s*$/)?.[1] ?? []
                )
        );
        const seenSpecPaths = new Set();
        let sectionId = "";
        let headingCount = 0;

        for (const line of lines) {
            const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
            if (heading) {
                const id = getHeadingId(heading[1], usedIds);
                headingCount++;
                sectionId = headingCount === 1 ? "" : id;
                continue;
            }
            if (!/^EXAMPLE\s+/.test(line)) {
                continue;
            }

            // EXAMPLE paths may be plain, single- or double-quoted.
            const match = line.match(
                /^EXAMPLE\s+(?:"([^"]+)"|'([^']+)'|(\S+))/
            );
            if (!match) {
                throw new Error(
                    `Invalid EXAMPLE directive in ${page}: ${line}`
                );
            }
            const specPath = match[1] ?? match[2] ?? match[3];
            const entry = bySpecPath.get(specPath);
            if (!entry) {
                throw new Error(`Unknown EXAMPLE in ${page}: ${specPath}`);
            }
            // One link per page, targeting the first occurrence of this example.
            if (!seenSpecPaths.has(specPath)) {
                const url = new URL(pageUrl);
                url.hash = sectionId;
                entry.documentation.push({ title, url: url.href });
                seenSpecPaths.add(specPath);
            }
        }
    }
}

/**
 * Match the default Python-Markdown TOC conventions configured in zensical.toml:
 * ASCII heading text, hyphenated words, and numbered duplicate IDs.
 * Conventions: https://github.com/Python-Markdown/markdown/blob/3.10.2/markdown/extensions/toc.py
 *
 * @param {string} text
 * @param {Set<string>} usedIds
 */
function getHeadingId(text, usedIds) {
    const explicitId = text.match(/\{[^}]*#([^\s}]+)[^}]*\}\s*$/)?.[1];
    if (explicitId) {
        return explicitId;
    }

    let id = text
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/<[^>]*>/g, "")
        .normalize("NFKD")
        .replace(/[^\t\x20-\x7E]/g, "")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/g, "-");
    const [, stem, suffix] = id.match(/^(.*?)(?:_(\d+))?$/);
    let count = Number(suffix ?? 0);
    while (!id || usedIds.has(id)) {
        id = stem + "_" + ++count;
    }
    usedIds.add(id);
    return id;
}

/**
 * Ignore directives and headings shown as code, including longer outer fences.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
function getUnfencedLines(markdown) {
    const lines = [];
    let fence = "";
    for (const line of markdown.split(/\r?\n/)) {
        const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
        if (!fence && marker) {
            fence = marker[1];
        } else if (fence) {
            if (
                marker &&
                marker[1][0] === fence[0] &&
                marker[1].length >= fence.length &&
                !marker[2].trim()
            ) {
                fence = "";
            }
        } else {
            lines.push(line);
        }
    }
    return lines;
}

/**
 * @param {string} dir
 * @param {(absolutePath: string) => void} visitor
 * @param {string} extension
 */
function visit(dir, visitor, extension = ".json") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            visit(absolutePath, visitor, extension);
        } else if (entry.isFile() && entry.name.endsWith(extension)) {
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
    const publicRelativePath = getPublicRelativePath(relativePath);
    const pathSegments = relativePath.split("/");
    const sourceGroup = pathSegments[0];
    const categorySegments = trimTrailingIndex(pathSegments.slice(1, -1));
    const title = getCatalogTitle(spec.description, pathSegments.at(-1));
    const screenshotPath = specPath.replace(/\.json$/, ".png");
    const hasScreenshot = fs.existsSync(
        absolutePath.replace(/\.json$/, ".png")
    );

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
        specUrl: `${specUrlRoot}/${publicRelativePath}`,
        screenshotPath: hasScreenshot ? screenshotPath : null,
        screenshotUrl: hasScreenshot
            ? `${specUrlRoot}/${publicRelativePath.replace(/\.json$/, ".png")}`
            : null,
        sourceMode: "shared-example",
        documentation: /** @type {{title: string, url: string}[]} */ ([]),
    };
}

/**
 * @param {string} relativePath
 */
function getPublicRelativePath(relativePath) {
    return relativePath;
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
        return firstDescriptionLine(description) ?? "";
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
        const firstLine = firstDescriptionLine(description);
        if (firstLine) {
            return firstLine;
        }
    } else if (
        typeof description === "string" &&
        description.trim().length > 0
    ) {
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

/**
 * @param {string[]} description
 */
function firstDescriptionLine(description) {
    return description.find(
        (line) => typeof line === "string" && line.trim().length > 0
    );
}
