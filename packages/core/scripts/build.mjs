/* eslint-disable no-sync */

// This script renames and minifies GLSL files into JavaScript files so that
// the core library's users do not need to configure special handling for such files.

import fs from "node:fs";
import path from "node:path";
import glob from "glob";

const srcDir = "src";
const distDir = path.join("dist", "src");

const importRegex = /(import [a-zA-Z_]+ from "[^"]+\.glsl)"/g;

// Source: https://github.com/vwochnik/rollup-plugin-glsl/blob/master/index.js
function compressShader(source) {
    let needNewline = false;
    return source
        .replace(
            /\\(?:\r\n|\n\r|\n|\r)|\/\*.*?\*\/|\/\/(?:\\(?:\r\n|\n\r|\n|\r)|[^\n\r])*/g,
            ""
        )
        .split(/\n+/)
        .reduce((result, line) => {
            line = line.trim().replace(/\s{2,}|\t/, " ");
            if (line[0] === "#") {
                if (needNewline) {
                    result.push("\n");
                }

                result.push(line, "\n");
                needNewline = false;
            } else {
                result.push(
                    line.replace(
                        /\s*({|}|=|\*|,|\+|\/|>|<|&|\||\[|\]|\(|\)|\-|!|;)\s*/g,
                        "$1"
                    )
                );
                needNewline = true;
            }
            return result;
        }, [])
        .join("")
        .replace(/\n+/g, "\n");
}

// Function to preprocess a JavaScript file
function preprocessFile(filePath) {
    const fileContents = fs.readFileSync(filePath, "utf8");

    if (filePath.endsWith(".glsl.js")) {
        // Wrap .glsl.js contents in a string variable and export it
        const preprocessedContents = `const shader = ${JSON.stringify(
            compressShader(fileContents)
        )};
export default shader;\n`;
        fs.writeFileSync(filePath, preprocessedContents, "utf8");
    } else {
        // Replace import paths in other JavaScript files
        const preprocessedContents = fileContents.replace(
            importRegex,
            '$1.js"'
        );
        fs.writeFileSync(filePath, preprocessedContents, "utf8");
    }
}

// Copy files, directories, and preprocess JavaScript files
function copyAndPreprocess(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest);
    }

    glob.sync("**/*", { cwd: src }).forEach((file) => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);

        if (fs.statSync(srcPath).isDirectory()) {
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath);
            }
        } else if (file.endsWith(".glsl")) {
            // Rename .glsl to .glsl.js
            const newDestPath = destPath.replace(/\.glsl$/, ".glsl.js");
            fs.copyFileSync(srcPath, newDestPath);
            preprocessFile(newDestPath);
        } else {
            fs.copyFileSync(srcPath, destPath);

            if (file.endsWith(".js")) {
                preprocessFile(destPath);
            }
        }
    });
}

copyAndPreprocess(srcDir, distDir);
console.log("Build completed.");
