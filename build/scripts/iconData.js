const fs = require("node:fs");

const metadataFields = [
    "iconName",
    "sourceName",
    "family",
    "style",
    "width",
    "height",
    "viewBox",
    "categories",
    "svgPathData",
    "variants",
    "keywords",
];
const validIconName = (name) => /^sf[A-Za-z0-9]+$/.test(name);

/** Read the curated data-only TypeScript module without executing JavaScript. */
function readAliases(file) {
    const source = fs.readFileSync(file, "utf8");
    const tokens = [
        ...source.matchAll(
            /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_$][\w$]*|./gs,
        ),
    ]
        .map((match) => match[0])
        .filter((token) => !/^\s|^\/\/|^\/\*/.test(token));
    let cursor = 0;
    const take = (expected) => {
        const token = tokens[cursor++];
        if (token === undefined || (expected && token !== expected))
            throw new Error(
                `Invalid aliases data: expected ${expected || "value"}, got ${token}`,
            );
        return token;
    };
    function value() {
        const token = take();
        if (token === "{" || token === "[") {
            const object = token === "{";
            const result = object ? Object.create(null) : [];
            const end = object ? "}" : "]";
            while (tokens[cursor] !== end) {
                if (object) {
                    const keyToken = take();
                    if (!/^(?:"|[A-Za-z_$])/.test(keyToken))
                        throw new Error("Invalid aliases data key");
                    const key = keyToken.startsWith('"')
                        ? JSON.parse(keyToken)
                        : keyToken;
                    if (Object.hasOwn(result, key))
                        throw new Error(`Duplicate aliases data key: ${key}`);
                    take(":");
                    result[key] = value();
                } else result.push(value());
                if (tokens[cursor] !== end) take(",");
            }
            take(end);
            return result;
        }
        if (/^(?:"|-?\d|true$|false$|null$)/.test(token))
            return JSON.parse(token);
        throw new Error(`Invalid aliases data token: ${token}`);
    }
    take("export");
    take("const");
    take("aliases");
    take("=");
    const aliases = value();
    if (tokens[cursor] === ";") take(";");
    if (
        cursor !== tokens.length ||
        !aliases ||
        Array.isArray(aliases) ||
        typeof aliases !== "object"
    )
        throw new Error("Invalid aliases data module");
    for (const [name, keywords] of Object.entries(aliases)) {
        if (!validIconName(name))
            throw new Error(`Invalid alias icon name: ${name}`);
        validateKeywords(keywords, name);
    }
    return JSON.parse(JSON.stringify(aliases));
}

function validateKeywords(keywords, name) {
    if (
        !Array.isArray(keywords) ||
        keywords.some(
            (entry) =>
                !entry ||
                typeof entry.text !== "string" ||
                !Number.isFinite(entry.priority) ||
                (entry.generic !== undefined &&
                    typeof entry.generic !== "boolean") ||
                Object.keys(entry).some(
                    (key) => !["text", "priority", "generic"].includes(key),
                ),
        )
    ) {
        throw new Error(`Invalid keywords/aliases for ${name}`);
    }
}

/** Restore canonical keywords without duplicating them on repeated package builds. */
function restoreAliases(icon, aliases) {
    const canonical = aliases[icon.iconName] || [];
    const same = (a, b) =>
        a.text === b.text &&
        a.priority === b.priority &&
        a.generic === b.generic;
    return {
        ...icon,
        keywords: [
            ...canonical,
            ...icon.keywords.filter(
                (entry) => !canonical.some((alias) => same(entry, alias)),
            ),
        ],
    };
}

/** Reject incomplete or incompatible input instead of silently dropping icon data. */
function validateIcon(icon, name) {
    if (
        !validIconName(name) ||
        !icon ||
        icon.iconName !== name ||
        Object.keys(icon).length !== metadataFields.length ||
        metadataFields.some((key) => !Object.hasOwn(icon, key))
    )
        throw new Error(`Invalid icon definition: ${name}`);
    if (
        typeof icon.sourceName !== "string" ||
        ![icon.family, icon.style].every(
            (v) => v === null || typeof v === "string",
        ) ||
        ![icon.width, icon.height].every(Number.isFinite) ||
        typeof icon.viewBox !== "string" ||
        !Array.isArray(icon.categories) ||
        !icon.categories.every((v) => typeof v === "string")
    )
        throw new Error(`Invalid icon metadata: ${name}`);
    if (
        !Array.isArray(icon.svgPathData) ||
        icon.svgPathData.some(
            (p) =>
                !p ||
                typeof p.d !== "string" ||
                (p.fill !== undefined && typeof p.fill !== "string") ||
                (p.fillOpacity !== undefined &&
                    !Number.isFinite(p.fillOpacity)) ||
                Object.keys(p).some(
                    (key) => !["d", "fill", "fillOpacity"].includes(key),
                ),
        )
    )
        throw new Error(`Invalid SVG paths: ${name}`);
    if (
        !icon.variants ||
        typeof icon.variants !== "object" ||
        Array.isArray(icon.variants) ||
        !Object.values(icon.variants).every(
            (v) => typeof v === "string" && validIconName(v),
        )
    )
        throw new Error(`Invalid icon variants: ${name}`);
    validateKeywords(icon.keywords, name);
}

/** Shared source emitter for SVG generation and lossless distribution rebuilding. */
function emitIconSource(icon) {
    validateIcon(icon, icon.iconName);
    return `import type { IconDefinition } from "@bradleyhodges/sfsymbols-types";\n${metadataFields.map((key) => `const ${key}: IconDefinition["${key}"] = ${JSON.stringify(icon[key])};`).join("\n")}\n\nexport const ${icon.iconName}: IconDefinition = {\n${metadataFields.map((key) => `  ${key},`).join("\n")}\n};\n\nexport { ${metadataFields.join(", ")} };\n`;
}

module.exports = {
    metadataFields,
    validIconName,
    readAliases,
    restoreAliases,
    validateIcon,
    emitIconSource,
};
