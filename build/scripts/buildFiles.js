const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const esbuild = require("esbuild");

/** Retry temporary Windows sharing violations without hiding permanent failures. */
async function retryFileOperation(operation) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (
                attempt === 5 ||
                !["EBUSY", "EPERM", "EACCES"].includes(error.code)
            )
                throw error;
            await delay(100 * (attempt + 1));
        }
    }
}

/** Remove only known generated directories within this package. Fail the build on error. */
async function removeBuildDirectory(directory, packageRoot) {
    const target = path.resolve(directory);
    const allowed = ["dist", "src", "build/src"].map((name) =>
        path.resolve(packageRoot, name),
    );
    if (!allowed.includes(target))
        throw new Error(
            `Refusing to remove unexpected build directory: ${target}`,
        );
    await retryFileOperation(() =>
        fs.rm(target, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 100,
        }),
    );
}

/** Minify in memory so esbuild never maps and overwrites the same on-disk file. */
async function minifyFiles(directory, format) {
    if (!["esm", "cjs"].includes(format))
        throw new Error(`Unsupported output format: ${format}`);
    const files = [];
    async function collect(folder) {
        for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
            const file = path.join(folder, entry.name);
            if (entry.isDirectory()) await collect(file);
            else if (entry.isFile() && entry.name.endsWith(".js"))
                files.push(file);
        }
    }
    await collect(directory);
    let cursor = 0;
    let failed = false;
    let failure;
    async function worker() {
        while (!failed && cursor < files.length) {
            const file = files[cursor++];
            try {
                const source = await fs.readFile(file, "utf8");
                const { code } = await esbuild.transform(source, {
                    loader: "js",
                    sourcefile: file,
                    minify: true,
                    format,
                    sourcemap: false,
                    treeShaking: true,
                });
                const temporary = `${file}.${randomUUID()}.tmp`;
                try {
                    await fs.writeFile(temporary, code, {
                        flag: "wx",
                        mode: (await fs.stat(file)).mode,
                    });
                    await retryFileOperation(() => fs.rename(temporary, file));
                } finally {
                    await retryFileOperation(() =>
                        fs.rm(temporary, { force: true }),
                    );
                }
            } catch (error) {
                if (!failed) failure = error;
                failed = true;
            }
        }
    }
    // Drain active writes before the caller can clean up or replace the output tree.
    await Promise.all(Array.from({ length: 4 }, worker));
    if (failed) throw failure;
}

module.exports = { minifyFiles, removeBuildDirectory, retryFileOperation };
