const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const packageRoot = path.resolve(__dirname, "../..");

async function fixture(t, failure) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sf-workflow-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const icons = path.join(root, "icons");
    for (const name of ["icons", "react", "types"]) {
        const directory = path.join(root, name);
        await fs.mkdir(path.join(directory, "src"), { recursive: true });
        await fs.writeFile(
            path.join(directory, "package.json"),
            JSON.stringify({
                name:
                    name === "icons"
                        ? "@bradleyhodges/sfsymbols"
                        : `@bradleyhodges/sfsymbols-${name}`,
                version: "1.0.0",
                dependencies: {
                    "@bradleyhodges/sfsymbols-types": "0.9.0",
                    unrelated: "^3.0.0",
                },
            }),
        );
        if (name !== "icons")
            await fs.writeFile(
                path.join(directory, "src/version.ts"),
                'export const VERSION = "0.9.0";\n',
            );
    }
    const scripts = path.join(icons, "build/scripts");
    const assets = path.join(icons, "build/src/src/Shapes");
    await fs.mkdir(scripts, { recursive: true });
    await fs.mkdir(assets, { recursive: true });
    await fs.mkdir(path.join(icons, "attr"));
    for (const name of [
        "build.js",
        "buildFiles.js",
        "buildIcons.js",
        "buildPackage.js",
        "iconData.js",
        "iconNames.js",
        "generateCategories.js",
        "readDistribution.js",
    ])
        await fs.copyFile(path.join(__dirname, name), path.join(scripts, name));
    const svg =
        '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/><path d="M2 2h4v4H2z"/></svg>';
    await fs.writeFile(path.join(assets, "sample.svg"), svg);
    await fs.writeFile(
        path.join(icons, "attr/aliases.ts"),
        "export const aliases = {};",
    );
    await fs.writeFile(
        path.join(icons, "attr/categories.ts"),
        'export const categories = [{name: "What\'s New", icon: "", items: ["sample"]}, {name: "Shapes", icon: "", items: []}];',
    );
    await fs.writeFile(
        path.join(icons, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: {
                strict: true,
                skipLibCheck: true,
                esModuleInterop: true,
                target: "es2022",
                module: "preserve",
                ...(failure === "compile"
                    ? { types: ["missing-workflow-test-types"] }
                    : {}),
                paths: {
                    "@bradleyhodges/sfsymbols-types": [
                        path.join(
                            packageRoot,
                            "node_modules/@bradleyhodges/sfsymbols-types/dist/main/index.d.ts",
                        ),
                    ],
                },
            },
        }),
    );
    const hook = path.join(root, "test-hook.cjs");
    await fs.writeFile(
        hook,
        `
        const fs = require('node:fs');
        const Module = require('node:module');
        const load = Module._load;
        Module._load = function(name, ...args) {
            if (name === 'inquirer') return {default: {prompt: async () => ({version: ${JSON.stringify(failure === "locked" ? "2.0.0" : "1.0.0")}})}};
            return load.call(this, name, ...args);
        };
        const target = ${JSON.stringify(path.join(icons, "package.json"))};
        const failure = ${JSON.stringify(failure)};
        const error = code => Object.assign(new Error(code + ': injected manifest file failure'), {code});
        const syncWrite = fs.writeFileSync;
        fs.writeFileSync = function(file, ...args) {
            if (file === target && ['version', 'locked', 'unchanged'].includes(failure)) throw error(failure === 'locked' ? 'UNKNOWN' : 'ENOSPC');
            return syncWrite.call(this, file, ...args);
        };
        const write = fs.promises.writeFile;
        fs.promises.writeFile = async function(file, ...args) {
            if (file === target && ['version', 'locked', 'unchanged'].includes(failure)) throw error(failure === 'locked' ? 'UNKNOWN' : 'ENOSPC');
            return write.call(this, file, ...args);
        };
        const rename = fs.promises.rename;
        let locks = 0;
        fs.promises.rename = async function(from, to) {
            if (to === target && ['version', 'unchanged'].includes(failure)) throw error('ENOSPC');
            if (to === target && failure === 'locked' && locks++ < 2) throw error('EPERM');
            return rename.call(this, from, to);
        };
    `,
    );
    return { root, icons, svg, hook };
}

function runBuild({ icons, hook }) {
    return spawnSync(
        process.execPath,
        ["--require", hook, path.join(icons, "build/scripts/build.js")],
        {
            cwd: icons,
            encoding: "utf8",
            env: {
                ...process.env,
                NODE_PATH: path.join(packageRoot, "node_modules"),
            },
        },
    );
}

for (const failure of ["version", "compile"]) {
    test(`a ${failure} failure retains raw SVGs and generated source for another attempt`, async (t) => {
        const data = await fixture(t, failure);
        const result = runBuild(data);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(
            result.stdout + result.stderr,
            failure === "version" ? /ENOSPC/ : /missing-workflow-test-types/,
        );
        assert.equal(
            await fs.readFile(
                path.join(data.icons, "build/src/src/Shapes/sample.svg"),
                "utf8",
            ),
            data.svg,
        );
        assert.match(
            await fs.readFile(path.join(data.icons, "src/sfSample.ts"), "utf8"),
            /export const sfSample/,
        );
        if (failure === "version") {
            const manifest = JSON.parse(
                await fs.readFile(
                    path.join(data.icons, "package.json"),
                    "utf8",
                ),
            );
            assert.equal(
                manifest.dependencies["@bradleyhodges/sfsymbols-types"],
                "0.9.0",
            );
        }
        assert.equal(
            (await fs.readdir(data.icons)).some((name) =>
                name.endsWith(".tmp"),
            ),
            false,
        );
    });
}

test("mapped-file overwrite failures are avoided and temporary replacement locks are retried", async (t) => {
    const data = await fixture(t, "locked");
    const result = runBuild(data);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const name of ["icons", "react", "types"]) {
        const manifest = JSON.parse(
            await fs.readFile(
                path.join(data.root, name, "package.json"),
                "utf8",
            ),
        );
        assert.equal(manifest.version, "2.0.0");
        assert.equal(
            manifest.dependencies["@bradleyhodges/sfsymbols-types"],
            "2.0.0",
        );
        assert.equal(manifest.dependencies.unrelated, "^3.0.0");
        if (name !== "icons")
            assert.equal(
                await fs.readFile(
                    path.join(data.root, name, "src/version.ts"),
                    "utf8",
                ),
                'export const VERSION = "2.0.0";\n',
            );
        assert.equal(
            (await fs.readdir(path.join(data.root, name))).some((file) =>
                file.endsWith(".tmp"),
            ),
            false,
        );
    }
    assert.equal(
        require(path.join(data.icons, "dist/main/sfSample.js")).sfSample
            .iconName,
        "sfSample",
    );
    await assert.rejects(fs.stat(path.join(data.icons, "build/src")), {
        code: "ENOENT",
    });
    await assert.rejects(fs.stat(path.join(data.icons, "src")), {
        code: "ENOENT",
    });
});

test("already-current manifests are left untouched", async (t) => {
    const data = await fixture(t, "unchanged");
    const file = path.join(data.icons, "package.json");
    const manifest = JSON.parse(await fs.readFile(file, "utf8"));
    manifest.dependencies["@bradleyhodges/sfsymbols-types"] = "1.0.0";
    const original = JSON.stringify(manifest, null, 4);
    await fs.writeFile(file, original);
    const result = runBuild(data);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(await fs.readFile(file, "utf8"), original);
});
