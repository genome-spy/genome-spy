const fs = require("fs");
const path = require("path");

// Directory to start from
const rootDir = "./src"; // Change this to the root directory of your ES project

// Regex to match JSDoc type imports within curly braces
const jsdocImportRegex = /{[^}]*import\(["'](.+?)["']\)[^}]*}/g;

/**
 * Add '.js' to JSDoc import paths where necessary
 * @param {string} match The entire import match
 * @param {string} importPath The import path
 * @returns {string} The updated import statement
 */
function addJsExtensionToJSDoc(match, importPath) {
    // Only add '.js' to relative paths without a file extension
    if (importPath.startsWith(".")) {
        return match.replace(importPath, `${importPath}.js`);
    }
    return match;
}

/**
 * Process a file: read its content, replace JSDoc import paths, and write back if needed
 * @param {string} filePath The path to the file to process
 */
function processFile(filePath) {
    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
            console.error(`Error reading file: ${filePath}`, err);
            return;
        }

        // Replace the JSDoc import paths
        const updatedData = data.replace(
            jsdocImportRegex,
            addJsExtensionToJSDoc
        );

        // If changes have been made, write the file
        if (updatedData !== data) {
            fs.writeFile(filePath, updatedData, "utf8", (err) => {
                if (err) {
                    console.error(`Error writing file: ${filePath}`, err);
                } else {
                    console.log(`Updated JSDoc imports in: ${filePath}`);
                }
            });
        }
    });
}

/**
 * Recursively process all files in a directory
 * @param {string} directory The directory to process
 */
function processDirectory(directory) {
    fs.readdir(directory, { withFileTypes: true }, (err, files) => {
        if (err) {
            console.error(`Error reading directory: ${directory}`, err);
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(directory, file.name);
            if (file.isDirectory()) {
                processDirectory(filePath);
            } else if (file.isFile() && filePath.endsWith(".js")) {
                processFile(filePath);
            }
        });
    });
}

// Start processing from the root directory
processDirectory(rootDir);
