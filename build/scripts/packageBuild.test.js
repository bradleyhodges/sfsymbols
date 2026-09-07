const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const packageRoot = path.resolve(__dirname, "../..");
const sample = {
    iconName: "sfSample",
    sourceName: "sample",
    family: "",
    style: null,
    width: 0,
    height: 0,
    viewBox: "0 0 24 24",
    categories: ["shapes"],
    svgPathData: [
        { d: "M0 0h24v24H0z", fill: "currentColor", fillOpacity: 0.5 },
    ],
    variants: { fill: "sfSampleFill" },
    keywords: [{ text: "generic", generic: true, priority: 0 }],
};

async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sf-package-test-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.mkdir(path.join(root, "attr"));
    await fs.writeFile(
        path.join(root, "attr/aliases.ts"),
        'export const aliases = { sfSample: [{ text: "search", priority: 10 }] };',
    );
    await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
            name: "sf-fixture",
            version: "1.0.0",
            main: "dist/main/index.js",
        }),
    );
    await fs.writeFile(
        path.join(root, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: {
                strict: true,
                skipLibCheck: true,
                esModuleInterop: true,
                target: "es2022",
                module: "preserve",
                declaration: true,
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
    for (const format of ["main", "module"]) {
        const dir = path.join(root, "dist", format);
        await fs.mkdir(dir, { recursive: true });
        const names = ["sfSample", "sfSampleFill"];
        for (const name of names) {
            const icon =
                name === "sfSample"
                    ? sample
                    : {
                          ...sample,
                          iconName: name,
                          sourceName: "sample.fill",
                          variants: {},
                      };
            const js =
                format === "main"
                    ? `exports.${name}=${JSON.stringify(icon)};${Object.keys(
                          icon,
                      )
                          .map(
                              (key) => `exports.${key}=exports.${name}.${key};`,
                          )
                          .join("")}`
                    : `const ${name}=${JSON.stringify(icon)};${Object.keys(icon)
                          .map((key) => `const ${key}=${name}.${key};`)
                          .join(
                              "",
                          )}export {${name},${Object.keys(icon).join(",")}};`;
            await fs.writeFile(path.join(dir, `${name}.js`), js);
        }
        await fs.writeFile(
            path.join(dir, "index.js"),
            format === "main"
                ? names
                      .map(
                          (name) =>
                              `exports.${name}=void 0;var ${name}=require("./${name}");Object.defineProperty(exports,"${name}",{enumerable:true,get:function(){return ${name}.${name}}});`,
                      )
                      .join("")
                : names
                      .map((name) => `export {${name}} from "./${name}";`)
                      .join("\n"),
        );
        const cats = {
            uniqueCategories: [{ key: "shapes", name: "Shapes" }],
            categoryMappings: { shapes: names },
        };
        await fs.writeFile(
            path.join(dir, "_categories.js"),
            Object.entries(cats)
                .map(([key, value]) =>
                    format === "main"
                        ? `exports.${key}=${JSON.stringify(value)};`
                        : `export const ${key}=${JSON.stringify(value)};`,
                )
                .join("\n"),
        );
    }
    return root;
}

test("package emission restores aliases and supports lazy CommonJS, native ESM and flat declarations", async (t) => {
    const root = await fixture(t);
    const { buildPackage } = require("./buildPackage");
    await buildPackage({ packageRoot: root, fromDist: true });
    const result = spawnSync(
        process.execPath,
        [
            "-e",
            `
        const assert=require('assert');const root=require(${JSON.stringify(path.join(root, "dist/main/index.js"))});
        assert.deepStrictEqual(Object.keys(root),['sfSample','sfSampleFill']);
        assert.equal(Object.keys(require.cache).filter(p=>/sfSample.*\\.js$/.test(p)).length,0);
        const icon=root.sfSample;
        assert.equal(Object.keys(require.cache).filter(p=>/sfSample.*\\.js$/.test(p)).length,1);
        assert.strictEqual(icon,require(${JSON.stringify(path.join(root, "dist/main/sfSample.js"))}).sfSample);
        const d=Object.getOwnPropertyDescriptor(root,'sfSample');assert.equal(d.enumerable,true);assert.equal(d.configurable,true);
    `,
        ],
        { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const esm = await import(
        pathToFileURL(path.join(root, "dist/module/index.js"))
    );
    assert.deepEqual(esm.sfSample.svgPathData, sample.svgPathData);
    assert.deepEqual(esm.sfSample.keywords, [
        { text: "search", priority: 10 },
        ...sample.keywords,
    ]);
    const declaration = await fs.readFile(
        path.join(root, "dist/module/index.d.ts"),
        "utf8",
    );
    assert.match(declaration, /export declare const sfSample: IconDefinition/);
    assert.doesNotMatch(declaration, /from ["']\.\/sf/);
    const cjsImport = await import(
        pathToFileURL(path.join(root, "dist/main/index.js"))
    );
    assert.equal(cjsImport.sfSample.iconName, "sfSample");
    await buildPackage({ packageRoot: root, fromDist: true });
    const rebuilt = JSON.parse(
        spawnSync(
            process.execPath,
            [
                "-e",
                `console.log(JSON.stringify(require(${JSON.stringify(path.join(root, "dist/main/sfSample.js"))}).sfSample))`,
            ],
            { encoding: "utf8" },
        ).stdout,
    );
    assert.deepEqual(
        rebuilt.keywords,
        esm.sfSample.keywords,
        "rebuilding must not accumulate aliases",
    );
});

test("mismatched output formats fail before replacing the existing distribution", async (t) => {
    const root = await fixture(t);
    const file = path.join(root, "dist/module/sfSample.js");
    await fs.writeFile(
        file,
        (await fs.readFile(file, "utf8")).replace("M0 0h24v24H0z", "M1 1"),
    );
    const original = await fs.readFile(path.join(root, "dist/main/index.js"));
    await assert.rejects(
        require("./buildPackage").buildPackage({
            packageRoot: root,
            fromDist: true,
        }),
        /mismatch/i,
    );
    assert.deepEqual(
        await fs.readFile(path.join(root, "dist/main/index.js")),
        original,
    );
});

test("malformed aliases fail without changing distribution files or executing expressions", async (t) => {
    const root = await fixture(t);
    const original = await fs.readFile(path.join(root, "dist/main/index.js"));
    await fs.writeFile(
        path.join(root, "attr/aliases.ts"),
        'export const aliases = { sfSample: [{text: (() => "unsafe")(), priority: 10}] };',
    );
    await assert.rejects(
        require("./buildPackage").buildPackage({
            packageRoot: root,
            fromDist: true,
        }),
        /data|alias|token/i,
    );
    assert.deepEqual(
        await fs.readFile(path.join(root, "dist/main/index.js")),
        original,
    );
});

test("an incorrect ESM metadata export is rejected even when the root icon data matches", async (t) => {
    const root = await fixture(t);
    const file = path.join(root, "dist/module/sfSample.js");
    await fs.writeFile(
        file,
        (await fs.readFile(file, "utf8")).replace(
            "const width=sfSample.width;",
            "const width=999;",
        ),
    );
    await assert.rejects(
        require("./buildPackage").buildPackage({
            packageRoot: root,
            fromDist: true,
        }),
        /metadata.*mismatch|mismatch.*metadata/i,
    );
});

test("SVG generation and source-mode packaging preserve multiple paths and restore curated aliases", async (t) => {
    const root = await fixture(t);
    const scripts = path.join(root, "build/scripts");
    const assets = path.join(root, "build/src/src/Shapes");
    await fs.mkdir(scripts, { recursive: true });
    await fs.mkdir(assets, { recursive: true });
    for (const file of [
        "buildIcons.js",
        "iconNames.js",
        "generateCategories.js",
        "iconData.js",
    ]) {
        await fs.copyFile(path.join(__dirname, file), path.join(scripts, file));
    }
    await fs.writeFile(
        path.join(root, "attr/categories.ts"),
        `export const categories = [{ name: "What's New", icon: "", items: ["sample"] }, { name: "Shapes", icon: "", items: [] }];`,
    );
    const svg =
        '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="currentColor" fill-opacity="0.5"/><path d="M1 1h2v2H1z" fill="currentColor"/></svg>';
    await fs.writeFile(path.join(assets, "sample.svg"), svg);
    await fs.writeFile(path.join(assets, "sample.fill.svg"), svg);
    const generated = spawnSync(
        process.execPath,
        [path.join(scripts, "buildIcons.js")],
        {
            encoding: "utf8",
            env: {
                ...process.env,
                NODE_PATH: path.join(packageRoot, "node_modules"),
            },
        },
    );
    assert.equal(generated.status, 0, generated.stderr);
    await require("./buildPackage").buildPackage({ packageRoot: root });
    const icon = JSON.parse(
        spawnSync(
            process.execPath,
            [
                "-e",
                `console.log(JSON.stringify(require(${JSON.stringify(path.join(root, "dist/main/sfSample.js"))}).sfSample))`,
            ],
            { encoding: "utf8" },
        ).stdout,
    );
    assert.deepEqual(icon.svgPathData, [
        { d: "M0 0h24v24H0z", fill: "currentColor", fillOpacity: 0.5 },
        { d: "M1 1h2v2H1z", fill: "currentColor" },
    ]);
    assert.deepEqual(icon.keywords, [{ text: "search", priority: 10 }]);
    assert.equal(icon.variants.fill, "sfSampleFill");
});

test("failed distribution replacement restores the previous catalogue", async (t) => {
    const root = await fixture(t);
    const original = await fs.readFile(path.join(root, "dist/main/index.js"));
    const rename = fs.rename;
    t.mock.method(fs, "rename", async (from, to) => {
        if (
            path.basename(from) === "dist" &&
            path.dirname(from).includes("package-") &&
            to === path.join(root, "dist")
        ) {
            throw Object.assign(new Error("replacement denied"), {
                code: "ENOSPC",
            });
        }
        return rename(from, to);
    });
    await assert.rejects(
        require("./buildPackage").buildPackage({
            packageRoot: root,
            fromDist: true,
        }),
        /replacement denied/,
    );
    assert.deepEqual(
        await fs.readFile(path.join(root, "dist/main/index.js")),
        original,
    );
    assert.deepEqual(await fs.readdir(path.join(root, "build-out")), []);
});
