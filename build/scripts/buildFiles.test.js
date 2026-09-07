const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
    minifyFiles,
    removeBuildDirectory,
    retryFileOperation,
} = require("./buildFiles");

async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sf-build-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    return root;
}

test("cleanup succeeds once and tolerates an already absent output", async (t) => {
    const root = await fixture(t);
    const dist = path.join(root, "dist");
    await fs.mkdir(dist);
    await fs.writeFile(path.join(dist, "old.js"), "old");
    await removeBuildDirectory(dist, root);
    await assert.rejects(fs.stat(dist), { code: "ENOENT" });
    await removeBuildDirectory(dist, root);
    await assert.rejects(removeBuildDirectory(root, root), /Refusing/);
    await assert.rejects(
        removeBuildDirectory(path.join(root, "..", "dist"), root),
        /Refusing/,
    );
});

for (const format of ["esm", "cjs"]) {
    test(`minification preserves ${format} exports and declaration files`, async (t) => {
        const root = await fixture(t);
        const nested = path.join(root, "nested");
        await fs.mkdir(nested);
        const file = path.join(nested, "icon.js");
        const declaration = path.join(nested, "icon.d.ts");
        await fs.writeFile(
            file,
            format === "esm"
                ? "export const answer = 40 + 2;"
                : "exports.answer = 40 + 2;",
        );
        await fs.writeFile(declaration, "export declare const answer: number;");
        await minifyFiles(root, format);
        const code = await fs.readFile(file, "utf8");
        if (format === "esm") {
            assert.equal(
                (
                    await import(
                        `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
                    )
                ).answer,
                42,
            );
        } else {
            assert.equal(require(file).answer, 42);
        }
        assert.equal(
            await fs.readFile(declaration, "utf8"),
            "export declare const answer: number;",
        );
        assert.deepEqual((await fs.readdir(nested)).sort(), [
            "icon.d.ts",
            "icon.js",
        ]);
    });
}

test("temporary locks are retried, permanent errors fail immediately", async () => {
    let calls = 0;
    await retryFileOperation(() => {
        if (++calls < 3)
            throw Object.assign(new Error("locked"), { code: "EPERM" });
    });
    assert.equal(calls, 3);
    calls = 0;
    await assert.rejects(
        retryFileOperation(() => {
            calls++;
            throw Object.assign(new Error("full"), { code: "ENOSPC" });
        }),
        /full/,
    );
    assert.equal(calls, 1);
});

test("persistent locks fail after bounded retries", async () => {
    let calls = 0;
    await assert.rejects(
        retryFileOperation(() => {
            calls++;
            throw Object.assign(new Error("locked"), { code: "EBUSY" });
        }),
        /locked/,
    );
    assert.equal(calls, 6);
});

test("failed replacement retains original output and cleans temporary file", async (t) => {
    const root = await fixture(t);
    const file = path.join(root, "icon.js");
    const source = "export const answer = 40 + 2;";
    await fs.writeFile(file, source);
    t.mock.method(fs, "rename", async () => {
        throw Object.assign(new Error("denied"), { code: "ENOSPC" });
    });
    await assert.rejects(minifyFiles(root, "esm"), /denied/);
    assert.equal(await fs.readFile(file, "utf8"), source);
    assert.deepEqual(await fs.readdir(root), ["icon.js"]);
});

test("cleanup errors reject instead of reporting success", async (t) => {
    const root = await fixture(t);
    const mocked = t.mock.method(fs, "rm", async () => {
        throw new Error("cleanup failed");
    });
    await assert.rejects(
        removeBuildDirectory(path.join(root, "dist"), root),
        /cleanup failed/,
    );
    mocked.mock.restore();
});

test("minification runs four file operations at a time across nested directories", async (t) => {
    const root = await fixture(t);
    const nested = path.join(root, "nested");
    await fs.mkdir(nested);
    for (let i = 0; i < 12; i++) {
        await fs.writeFile(
            path.join(i % 2 ? nested : root, `${i}.js`),
            "exports.answer = 40 + 2;",
        );
    }
    const readFile = fs.readFile;
    let active = 0;
    let peak = 0;
    t.mock.method(fs, "readFile", async (...args) => {
        active++;
        peak = Math.max(peak, active);
        try {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return await readFile(...args);
        } finally {
            active--;
        }
    });
    await minifyFiles(root, "cjs");
    assert.equal(peak, 4);
    assert.equal(active, 0);
    for (let i = 0; i < 12; i++) {
        assert.equal(
            require(path.join(i % 2 ? nested : root, `${i}.js`)).answer,
            42,
        );
    }
});

test("a minification failure waits for active replacements and cleans their temporary files", async (t) => {
    const root = await fixture(t);
    for (let i = 0; i < 8; i++)
        await fs.writeFile(
            path.join(root, `${i}.js`),
            "exports.answer = 40 + 2;",
        );
    const rename = fs.rename;
    let active = 0;
    let finished = 0;
    t.mock.method(fs, "rename", async (from, to) => {
        active++;
        try {
            await new Promise((resolve) =>
                setTimeout(resolve, to.endsWith("0.js") ? 10 : 80),
            );
            if (to.endsWith("0.js"))
                throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
            return await rename(from, to);
        } finally {
            active--;
            finished++;
        }
    });
    await assert.rejects(minifyFiles(root, "cjs"), /disk full/);
    assert.equal(active, 0);
    assert.ok(
        finished > 1,
        "already active replacements must finish before rejection",
    );
    assert.equal(
        (await fs.readdir(root)).filter((name) => name.endsWith(".tmp")).length,
        0,
    );
    assert.equal(
        await fs.readFile(path.join(root, "0.js"), "utf8"),
        "exports.answer = 40 + 2;",
    );
});
