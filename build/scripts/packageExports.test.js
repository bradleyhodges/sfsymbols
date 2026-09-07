const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const { test } = require("node:test");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "../..");

test("flattened declarations cover every public icon with its existing signature", async () => {
    const names = Object.keys(require(path.join(root, "dist/main/index.js")));
    for (const format of ["main", "module"]) {
        const declarations = await fs.readFile(
            path.join(root, "dist", format, "index.d.ts"),
            "utf8",
        );
        assert.deepEqual(
            [
                ...declarations.matchAll(
                    /export declare const (\w+): IconDefinition;/g,
                ),
            ].map((match) => match[1]),
            names,
        );
        assert.match(declarations, /import type \{ IconDefinition \}/);
        assert.doesNotMatch(declarations, /from ["']\.\//);
    }
});

test("public CommonJS subpaths share objects with lazy root exports", () => {
    const result = spawnSync(
        process.execPath,
        [
            "-e",
            `
        const assert=require('node:assert/strict');
        const icons=require('@bradleyhodges/sfsymbols');
        const count=()=>Object.keys(require.cache).filter(p=>/[/\\\\]sf[^/\\\\]+\\.js$/.test(p)).length;
        Object.keys(icons); assert.equal(count(),0);
        const leaf=require('@bradleyhodges/sfsymbols/sfArrowUpCircleFill');
        assert.equal(count(),1);
        assert.strictEqual(icons.sfArrowUpCircleFill,leaf.sfArrowUpCircleFill);
        assert.strictEqual(leaf.svgPathData,leaf.sfArrowUpCircleFill.svgPathData);
        assert.ok(require('@bradleyhodges/sfsymbols/categories').uniqueCategories.length);
    `,
        ],
        { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
});

test("public native ESM root, category and individual imports resolve", () => {
    const result = spawnSync(
        process.execPath,
        [
            "--input-type=module",
            "-e",
            `
        import assert from 'node:assert/strict';
        import {sfArrowUpCircleFill} from '@bradleyhodges/sfsymbols';
        import {sfArrowUpCircleFill as direct,svgPathData} from '@bradleyhodges/sfsymbols/sfArrowUpCircleFill';
        import {uniqueCategories} from '@bradleyhodges/sfsymbols/categories';
        assert.strictEqual(sfArrowUpCircleFill,direct);
        assert.strictEqual(direct.svgPathData,svgPathData);
        assert.ok(uniqueCategories.length);
    `,
        ],
        { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
});

test("ESM root imports and both individual import formats retain only the selected icon", async () => {
    for (const contents of [
        'export {sfArrowUpCircleFill} from "@bradleyhodges/sfsymbols";',
        'export {sfArrowUpCircleFill} from "@bradleyhodges/sfsymbols/sfArrowUpCircleFill";',
        'module.exports=require("@bradleyhodges/sfsymbols/sfArrowUpCircleFill").sfArrowUpCircleFill;',
    ]) {
        const result = await esbuild.build({
            stdin: { contents, resolveDir: root },
            bundle: true,
            write: false,
            minify: true,
            metafile: true,
            platform: "browser",
            format: "esm",
            logLevel: "silent",
        });
        const inputs = Object.keys(
            Object.values(result.metafile.outputs)[0].inputs,
        ).filter((file) => /[/]sf[^/]+\.js$/.test(file));
        assert.equal(inputs.length, 1);
        assert.match(inputs[0], /sfArrowUpCircleFill\.js$/);
        assert.ok(
            result.outputFiles[0].contents.length < 2000,
            "one-icon imports must not pull in catalogue or runtime helpers",
        );
    }
});
