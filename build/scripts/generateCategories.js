const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const sourceDirectory = path.resolve(__dirname, "../src/src");
const categoriesFile = path.resolve(__dirname, "../../attr/categories.ts");
const isWhatsNew = (name) => /^what['’]s new$/i.test(name);
const categoryId = (name) => name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

function readCategories(source) {
    const tokens = [];
    const lexer = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*|[{}\[\]:,;=]|./gy;
    for (const match of source.matchAll(lexer)) {
        if (/^\s|^\/\//.test(match[0]) || match[0].startsWith("/*")) continue;
        tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    }
    let cursor = 0;
    const peek = () => tokens[cursor]?.text;
    function take(expected) {
        const token = tokens[cursor++];
        if (!token || (expected && token.text !== expected)) {
            throw new Error(`Invalid categories module: expected ${expected || "token"} near offset ${token?.start ?? source.length}`);
        }
        return token;
    }
    function string() {
        const token = take().text;
        // The checked-in format uses JSON strings; reject executable expressions.
        if (!token.startsWith('"')) throw new Error("Category values must be double-quoted strings");
        return JSON.parse(token);
    }
    take("export"); take("const"); take("categories"); take("="); take("[");
    const entries = [];
    while (peek() !== "]") {
        const start = take("{").start;
        const category = Object.create(null);
        while (peek() !== "}") {
            const keyToken = take().text;
            const key = keyToken.startsWith('"') ? JSON.parse(keyToken) : keyToken;
            if (!["name", "icon", "items"].includes(key) || Object.hasOwn(category, key)) {
                throw new Error(`Unsupported or duplicate category property: ${key}`);
            }
            take(":");
            if (key === "items") {
                take("["); category.items = [];
                while (peek() !== "]") {
                    category.items.push(string());
                    if (peek() !== "]") take(",");
                }
                take("]");
            } else category[key] = string();
            if (peek() !== "}") take(",");
        }
        const end = take("}").end;
        if (typeof category.name !== "string" || typeof category.icon !== "string" || !Array.isArray(category.items)) {
            throw new Error("Every category must contain name, icon and items");
        }
        entries.push({ ...category, raw: source.slice(start, end) });
        if (peek() !== "]") take(",");
    }
    take("]");
    if (peek() === ";") take(";");
    if (cursor !== tokens.length) throw new Error("Unexpected code after categories array");
    return entries;
}

/** Discover category memberships and unique SF assets; reject ambiguous duplicate exports. */
function discoverIcons(directory = sourceDirectory) {
    const icons = new Map();
    const categories = [];
    const ids = new Set([categoryId("What's New")]);
    function addIcon(file) {
        const name = path.basename(file, path.extname(file));
        if (!name) throw new Error(`Empty icon name: ${file}`);
        const existing = icons.get(name);
        if (existing && !fs.readFileSync(existing).equals(fs.readFileSync(file))) {
            throw new Error(`Conflicting SVGs for ${name}: ${existing} and ${file}`);
        }
        if (!existing) icons.set(name, file);
        return name;
    }
    function filesIn(folder) {
        return fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    }
    for (const entry of filesIn(directory)) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${fullPath}`);
        if (entry.isFile() && /\.svg$/i.test(entry.name)) addIcon(fullPath);
        if (!entry.isDirectory() || entry.name === "brands" || isWhatsNew(entry.name)) continue;
        const id = categoryId(entry.name);
        if (!id || ids.has(id)) throw new Error(`Duplicate or empty category identifier: ${entry.name}`);
        ids.add(id);
        const items = [];
        for (const asset of filesIn(fullPath)) {
            if (asset.name.startsWith(".")) continue;
            const assetPath = path.join(fullPath, asset.name);
            if (asset.isDirectory() || asset.isSymbolicLink()) throw new Error(`Expected a flat category directory: ${assetPath}`);
            if (asset.isFile() && /\.svg$/i.test(asset.name)) items.push(addIcon(assetPath));
        }
        if (!items.length) throw new Error(`Category has no SVG icons: ${fullPath}`);
        categories.push({ name: entry.name, items: [...new Set(items)].sort() });
    }
    if (!categories.length) throw new Error(`No category folders found in ${directory}`);
    return { categories, icons };
}

/** Regenerate folder categories, preserving the manually maintained 'What's New' object verbatim. */
function generateCategories({ inputDir = sourceDirectory, outputFile = categoriesFile } = {}) {
    const previous = fs.readFileSync(outputFile, "utf8");
    const existing = readCategories(previous);
    const whatsNew = existing.filter((category) => isWhatsNew(category.name));
    if (whatsNew.length !== 1) throw new Error("Expected exactly one What's New category; refusing to overwrite");
    const discovered = discoverIcons(inputDir);
    const blocks = [whatsNew[0].raw];
    for (const category of discovered.categories) {
        const icon = existing.find((entry) => entry.name === category.name)?.icon ?? "";
        blocks.push(`{\n        name: ${JSON.stringify(category.name)},\n        icon: ${JSON.stringify(icon)},\n        items: [\n${category.items.map((item) => `            ${JSON.stringify(item)},`).join("\n")}\n        ],\n    }`);
    }
    const output = `export const categories = [\n    ${blocks.join(",\n    ")},\n];\n`;
    const changed = output !== previous;
    if (changed) {
        const temporary = `${outputFile}.${randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporary, output, { encoding: "utf8", flag: "wx", mode: fs.statSync(outputFile).mode });
            fs.renameSync(temporary, outputFile);
        } finally {
            fs.rmSync(temporary, { force: true });
        }
    }
    return { ...discovered, changed };
}

if (require.main === module) {
    try {
        const result = generateCategories();
        console.log(`${result.changed ? "Generated" : "Unchanged"} ${categoriesFile}: ${result.categories.length} folder categories, ${result.icons.size} unique SF icons; What's New preserved.`);
    } catch (error) {
        console.error(`Category generation failed: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = { generateCategories, discoverIcons, readCategories };
