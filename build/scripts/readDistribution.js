const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { metadataFields, validateIcon, validIconName } = require("./iconData");

/** Evaluate our trusted local build artifacts with a fresh, package-local module cache. */
function commonJsReader(directory) {
    const cache = new Map();
    return function read(name) {
        if (!/^(?:index|_categories|sf[A-Za-z0-9]+)$/.test(name))
            throw new Error(`Unexpected build module: ${name}`);
        if (cache.has(name)) return cache.get(name);
        const module = { exports: {} };
        cache.set(name, module.exports);
        vm.runInNewContext(
            fs.readFileSync(path.join(directory, `${name}.js`), "utf8"),
            {
                exports: module.exports,
                module,
                require(specifier) {
                    if (!specifier.startsWith("./"))
                        throw new Error(
                            `Unexpected runtime dependency: ${specifier}`,
                        );
                    return read(specifier.slice(2).replace(/\.js$/, ""));
                },
            },
            { filename: `${name}.js`, timeout: 30000 },
        );
        cache.set(name, module.exports);
        return module.exports;
    };
}

async function readEsm(directory, entry, names) {
    const result = await esbuild.build({
        ...(names
            ? {
                  stdin: {
                      resolveDir: directory,
                      contents: [
                          'export * as root from "./index.js";',
                          ...names.map(
                              (name, index) =>
                                  `export * as leaf${index} from "./${name}.js";`,
                          ),
                      ].join("\n"),
                  },
              }
            : { entryPoints: [path.join(directory, `${entry}.js`)] }),
        bundle: true,
        write: false,
        platform: "neutral",
        format: "cjs",
        target: "es2015",
        logLevel: "silent",
    });
    const module = { exports: {} };
    vm.runInNewContext(
        result.outputFiles[0].text,
        { module, exports: module.exports },
        { timeout: 30000 },
    );
    return module.exports;
}

/** Validate both formats and every module before a rebuild can replace the catalogue. */
async function readDistribution(directory) {
    const read = commonJsReader(path.join(directory, "main"));
    const root = read("index");
    const names = Object.keys(root);
    if (!names.length) throw new Error("Distribution contains no icons");
    if (!names.every(validIconName))
        throw new Error("Invalid distribution icon names");
    const esmPackage = await readEsm(
        path.join(directory, "module"),
        "index",
        names,
    );
    const esm = esmPackage.root;
    const normalize = (value) => JSON.parse(JSON.stringify(value));
    const match = (a, b, label) => {
        try {
            assert.deepEqual(normalize(a), normalize(b));
        } catch {
            throw new Error(`Distribution mismatch: ${label}`);
        }
    };
    match([...names].sort(), Object.keys(esm).sort(), "root exports");
    for (const format of ["main", "module"]) {
        match(
            fs
                .readdirSync(path.join(directory, format))
                .filter((file) => /^sf.*\.js$/.test(file))
                .map((file) => file.slice(0, -3))
                .sort(),
            [...names].sort(),
            `${format} icon files`,
        );
    }
    const icons = [];
    const nameSet = new Set(names);
    for (const [index, name] of names.entries()) {
        const icon = root[name];
        validateIcon(icon, name);
        match(icon, esm[name], name);
        for (const [format, leaf, definition] of [
            ["CommonJS", read(name), icon],
            ["ESM", esmPackage[`leaf${index}`], esm[name]],
        ]) {
            match(
                Object.keys(leaf).sort(),
                [name, ...metadataFields].sort(),
                `${format} ${name} metadata exports`,
            );
            if (leaf[name] !== definition)
                throw new Error(`Icon binding mismatch: ${format} ${name}`);
            for (const field of metadataFields) {
                if (leaf[field] !== definition[field])
                    throw new Error(
                        `Metadata binding mismatch: ${format} ${name}.${field}`,
                    );
            }
        }
        for (const variant of Object.values(icon.variants))
            if (!nameSet.has(variant))
                throw new Error(
                    `Missing variant ${variant} referenced by ${name}`,
                );
        icons.push(normalize(icon));
    }
    const categories = read("_categories");
    match(
        categories,
        await readEsm(path.join(directory, "module"), "_categories"),
        "categories",
    );
    if (
        !Array.isArray(categories.uniqueCategories) ||
        !categories.categoryMappings ||
        Object.keys(categories).sort().join() !==
            "categoryMappings,uniqueCategories"
    )
        throw new Error("Invalid category exports");
    const keys = categories.uniqueCategories.map((cat) => cat.key);
    if (
        new Set(keys).size !== keys.length ||
        categories.uniqueCategories.some(
            (cat) =>
                typeof cat.key !== "string" || typeof cat.name !== "string",
        )
    )
        throw new Error("Invalid category definitions");
    match(
        [...keys].sort(),
        Object.keys(categories.categoryMappings).sort(),
        "category keys",
    );
    for (const [category, members] of Object.entries(
        categories.categoryMappings,
    )) {
        if (
            !Array.isArray(members) ||
            members.some(
                (name) =>
                    !nameSet.has(name) ||
                    !root[name].categories.includes(category),
            )
        )
            throw new Error(`Invalid category membership: ${category}`);
    }
    return { icons, categories: normalize(categories) };
}

module.exports = { readDistribution };
