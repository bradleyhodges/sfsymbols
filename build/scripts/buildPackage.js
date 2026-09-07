const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { minifyFiles, retryFileOperation } = require("./buildFiles");
const { emitIconSource, readAliases, restoreAliases } = require("./iconData");
const { readDistribution } = require("./readDistribution");

/** Emit entry points without changing leaf modules or their public metadata exports. */
async function writeEntryPoints(directory, names) {
    const declarations = `import type { IconDefinition } from "@bradleyhodges/sfsymbols-types";\n${names.map((name) => `export declare const ${name}: IconDefinition;`).join("\n")}\n`;
    await fs.writeFile(
        path.join(directory, "module/index.js"),
        names
            .map((name) => `export { ${name} } from "./${name}.js";`)
            .join("\n"),
    );
    // The assignments preserve configurable getters, key order and Node's static export detection.
    const commonJs = [
        '"use strict";',
        'Object.defineProperty(exports, "__esModule", { value: true });',
    ];
    names.forEach((name, index) => {
        commonJs.push(
            `exports.${name} = void 0; var icon${index}; Object.defineProperty(exports, "${name}", { enumerable: true, get: function () { return (icon${index} || (icon${index} = require("./${name}.js"))).${name}; } });`,
        );
    });
    await fs.writeFile(
        path.join(directory, "main/index.js"),
        commonJs.join("\n"),
    );
    for (const format of ["main", "module"])
        await fs.writeFile(
            path.join(directory, format, "index.d.ts"),
            declarations,
        );
    await fs.writeFile(
        path.join(directory, "module/package.json"),
        '{"type":"module"}\n',
    );
}

/** Build in isolation and restore the previous distribution if replacement fails. */
async function buildPackage({
    packageRoot = path.resolve(__dirname, "../.."),
    fromDist = false,
} = {}) {
    packageRoot = path.resolve(packageRoot);
    const target = path.join(packageRoot, "dist");
    const aliases = readAliases(path.join(packageRoot, "attr/aliases.ts"));
    const original = fromDist ? await readDistribution(target) : null;
    const buildRoot = path.join(packageRoot, "build-out");
    await fs.mkdir(buildRoot, { recursive: true });
    if ((await fs.lstat(buildRoot)).isSymbolicLink())
        throw new Error("Refusing to stage a build through a symbolic link");
    const staging = await fs.mkdtemp(path.join(buildRoot, "package-"));
    const output = path.join(staging, "dist");
    const previous = path.join(staging, "previous-dist");
    let preserveBackup = false;
    try {
        const source = path.join(staging, "src");
        let expected;
        if (original) {
            expected = {
                ...original,
                icons: original.icons.map((icon) =>
                    restoreAliases(icon, aliases),
                ),
            };
            await fs.mkdir(source);
            for (const icon of expected.icons)
                await fs.writeFile(
                    path.join(source, `${icon.iconName}.ts`),
                    emitIconSource(icon),
                );
            await fs.writeFile(
                path.join(source, "index.ts"),
                expected.icons
                    .map(
                        (icon) =>
                            `export { ${icon.iconName} } from "./${icon.iconName}.js";`,
                    )
                    .join("\n"),
            );
            await fs.writeFile(
                path.join(source, "_categories.ts"),
                Object.entries(expected.categories)
                    .map(
                        ([key, value]) =>
                            `export const ${key} = ${JSON.stringify(value)};`,
                    )
                    .join("\n"),
            );
        } else {
            await fs.cp(path.join(packageRoot, "src"), source, {
                recursive: true,
                errorOnExist: true,
            });
        }
        await fs.writeFile(
            path.join(staging, "package.json"),
            '{"type":"commonjs"}\n',
        );
        const config = path.join(staging, "tsconfig.json");
        await fs.writeFile(
            config,
            JSON.stringify({
                extends: path.join(packageRoot, "tsconfig.json"),
                compilerOptions: {
                    rootDir: source,
                    outDir: path.join(output, "module"),
                    declaration: true,
                    noEmit: false,
                    emitDeclarationOnly: false,
                    module: "preserve",
                },
                include: [path.join(source, "**/*.ts")],
                exclude: [],
            }),
        );
        const tsc = path.join(
            path.dirname(require.resolve("typescript/package.json")),
            "bin/tsc",
        );
        execFileSync(process.execPath, [tsc, "-p", config], {
            stdio: "inherit",
        });
        execFileSync(
            process.execPath,
            [
                tsc,
                "-p",
                config,
                "--module",
                "NodeNext",
                "--outDir",
                path.join(output, "main"),
            ],
            { stdio: "inherit" },
        );
        const compiled = await readDistribution(output);
        if (expected)
            assert.deepEqual(
                compiled,
                expected,
                "Rebuilding changed icon data",
            );
        await writeEntryPoints(
            output,
            compiled.icons.map((icon) => icon.iconName),
        );
        await minifyFiles(path.join(output, "module"), "esm");
        await minifyFiles(path.join(output, "main"), "cjs");
        assert.deepEqual(
            await readDistribution(output),
            compiled,
            "Packaging changed icon data",
        );

        // Both directory moves are constrained to the requested package and its unique staging tree.
        if (
            path.dirname(target) !== packageRoot ||
            !staging.startsWith(`${buildRoot}${path.sep}`) ||
            path.dirname(output) !== staging ||
            path.dirname(previous) !== staging
        )
            throw new Error("Invalid package replacement paths");
        const existing = await fs.lstat(target).catch((error) => {
            if (error.code !== "ENOENT") throw error;
            return null;
        });
        if (existing?.isSymbolicLink())
            throw new Error("Refusing to replace a linked distribution");
        if (existing) {
            await retryFileOperation(() => fs.rename(target, previous));
            preserveBackup = true;
        }
        try {
            await retryFileOperation(() => fs.rename(output, target));
        } catch (error) {
            if (existing) {
                await retryFileOperation(() =>
                    fs.rename(previous, target),
                ).catch((restoreError) => {
                    throw new Error(
                        `Could not restore distribution; backup remains at ${previous}`,
                        { cause: restoreError },
                    );
                });
                preserveBackup = false;
            }
            throw error;
        }
        preserveBackup = false;
        return { iconCount: compiled.icons.length };
    } finally {
        if (!preserveBackup)
            await retryFileOperation(() =>
                fs.rm(staging, { recursive: true, force: true }),
            );
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--from-dist") || args.length > 1) {
        console.error(
            "Usage: node build/scripts/buildPackage.js [--from-dist]",
        );
        process.exitCode = 1;
    } else
        buildPackage({ fromDist: args.includes("--from-dist") })
            .then(({ iconCount }) =>
                console.log(`Built ${iconCount} icons in ESM and CommonJS.`),
            )
            .catch((error) => {
                console.error(`Package build failed: ${error.message}`);
                process.exitCode = 1;
            });
}

module.exports = { buildPackage };
