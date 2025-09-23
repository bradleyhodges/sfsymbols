const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const chalk = require("chalk");
const ora = require("ora").default;
const inquirer = require("inquirer").default;
const esbuild = require("esbuild");
const decompress = require("decompress");
const { extractFull } = require("node-7z");

// Function to log messages
const log = (message, color = "green") => {
    console.log(chalk[color](message));
};

// Initialize spinner
const spinner = ora();

// Read package.json
const packageJsonPath = path.resolve(__dirname, "../../package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

// Extract version
let version = packageJson.version;

// Function to remove a directory
const removeDir = async (dir) => {
    await new Promise((resolve, reject) => {
        spinner.start(`Deleting ${dir}...`);

        if (fs.existsSync(dir)) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                spinner.succeed(`Deleted ${dir}`);
                log(`🗑️ Deleted ${dir}`, "gray");

                resolve(true);
            } catch (error) {
                log(
                    `❌ Failed to delete ${dir}: ${error.message}. Trying again...`,
                    "yellow",
                );
            }

            try {
                execSync(`rimraf ${dir}`, { stdio: "inherit" });
                spinner.succeed(`Deleted ${dir}`);
                log(`🗑️ Deleted ${dir}`, "gray");
                resolve(true);
            } catch (error) {
                spinner.fail(`Failed to delete ${dir}`);
                log(`❌ Failed to delete ${dir}: ${error.message}`, "red");
                resolve(false);
            }
        } else {
            resolve(true);
        }
    });
};

// Prompt user to confirm version increment
const promptVersion = async () => {
    const answers = await inquirer.prompt([
        {
            type: "input",
            name: "version",
            message: `Current version is ${version}. Enter new version or press enter to continue with the current version:`,
            default: version,
        },
    ]);

    if (answers.version !== version) {
        version = answers.version;
        packageJson.version = version;
        fs.writeFileSync(
            packageJsonPath,
            JSON.stringify(packageJson, null, 2),
            "utf8",
        );
        log(`Updated package.json to version ${version}`, "yellow");
    }
};

// Function to minify JavaScript files
const minifyFiles = async (inputDir, format) => {
    const files = fs.readdirSync(inputDir);

    for (const file of files) {
        const filePath = path.join(inputDir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // Recursively minify files in subdirectories
            await minifyFiles(filePath, format);
        } else if (file.endsWith(".js")) {
            // Minify JavaScript files
            await esbuild.build({
                entryPoints: [filePath],
                outfile: filePath, // Overwrite the original file
                minify: true,
                format, // Use the correct format (esm or cjs)
                sourcemap: false, // Disable sourcemaps
                allowOverwrite: true,
                treeShaking: true, // Ensure tree shaking is enabled
            });
        }
    }
};

// Function to unpack archive
const unpackArchive = async () => {
    const archiveLocationDir = path.resolve(__dirname, "../../../");
    const archiveUnpackLocationDir = path.join(__dirname, "../src");

    if (fs.existsSync(archiveUnpackLocationDir)) {
        spinner.succeed(
            "Archive already unpacked. Skipping unpacking process.",
        );
        return true;
    }

    if (fs.existsSync(archiveLocationDir)) {
        const files = fs.readdirSync(archiveLocationDir);

        for (const file of files) {
            if (
                file.endsWith(".zip") ||
                file.endsWith(".tar.gz") ||
                file.endsWith(".7z")
            ) {
                const archivePath = path.join(archiveLocationDir, file);

                spinner.start(`Unpacking archive ${file}...`);

                try {
                    if (file.endsWith(".7z")) {
                        await new Promise((resolve, reject) => {
                            const stream = extractFull(
                                archivePath,
                                archiveUnpackLocationDir,
                                {
                                    $progress: true,
                                },
                            );

                            stream.on("progress", (progress) => {
                                spinner.text = `Unpacking archive (${progress.percent}% complete)...`;
                            });

                            stream.on("end", () => {
                                spinner.succeed(
                                    `Unpacked archive ${file} to ${archiveUnpackLocationDir}`,
                                );
                                resolve(true);
                            });

                            stream.on("error", (error) => {
                                spinner.fail(
                                    `Failed to unpack archive ${file}: ${error.message}`,
                                );
                                reject(error);
                            });
                        });
                    } else {
                        await decompress(archivePath, archiveUnpackLocationDir);
                        spinner.succeed(
                            `Unpacked archive ${file} to ${archiveUnpackLocationDir}`,
                        );
                        return true;
                    }
                } catch (error) {
                    spinner.fail(
                        `Failed to unpack archive ${file}: ${error.message}`,
                    );

                    spinner.stop();
                    return false;
                }
            }
        }
    } else {
        spinner.fail(
            `There is no archive to unpack in the \`sfsymbols\` directory (${archiveLocationDir}). Please make sure to place the archive in the correct location.`,
        );
        spinner.info(
            "The archive should be a .zip, .tar.gz, or .7z file and should contain two folders: `categories` and `src`.",
        );
        spinner.stop();
        return false;
    }
};

// Function for updating all sfsymbols package versions to the given version
const updateAllPackageVersions = async (version) => {
    await new Promise((resolve, reject) => {
        // Define the package root directories
        const packageRootDirectories = [
            path.resolve(__dirname, "../../../icons"),
            path.resolve(__dirname, "../../../react"),
            path.resolve(__dirname, "../../../types"),
        ];

        // Update the package.json version for each package
        for (const packageRoot of packageRootDirectories) {
            // Update the package.json version
            const packageJsonPath = path.resolve(packageRoot, "package.json");
            if (fs.existsSync(packageJsonPath)) {
                // Read the package.json file
                const packageJson = JSON.parse(
                    fs.readFileSync(packageJsonPath, "utf8"),
                );
                const currentVersion = packageJson.version;

                // Update the version
                packageJson.version = version;

                // Log the update
                log(
                    `Updated ${packageJson.name} package.json from version ${currentVersion} to current version ${version}`,
                    "yellow",
                );

                // Update the dependencies
                if (packageJson.dependencies) {
                    for (const [
                        dependency,
                        dependencyVersion,
                    ] of Object.entries(packageJson.dependencies)) {
                        if (dependency.startsWith("@advena/sfsymbols")) {
                            const currentVersion =
                                packageJson.dependencies[dependency];

                            // Update the version
                            packageJson.dependencies[dependency] = version;

                            // Log the update
                            log(
                                `Updated ${dependency} from version ${currentVersion} to current version ${version}`,
                                "yellow",
                            );
                        }
                    }
                }

                // Write the updated package.json file
                fs.writeFileSync(
                    packageJsonPath,
                    JSON.stringify(packageJson, null, 2),
                    "utf8",
                );

                // Log the update
                log(`Updated ${packageJson.name} package.json`, "yellow");
            } else {
                log(`No package.json found in ${packageRoot}`, "orange");
            }

            // Update the version.ts in the src/ directory
            const versionTsPath = path.resolve(packageRoot, "src/version.ts");
            if (fs.existsSync(versionTsPath)) {
                const versionTsContent = `export const VERSION = "${version}";\n`;
                fs.writeFileSync(versionTsPath, versionTsContent, "utf8");
                log(
                    `Updated version.ts in ${packageRoot} to current version ${version}`,
                    "yellow",
                );
            }
        }

        // Resolve the promise
        resolve(true);
    });
};

// Main build function
const build = async () => {
    await promptVersion();

    // Unpack archive if exists
    await unpackArchive();

    // Run build-icons command
    spinner.start("Running build-icons script...");
    execSync("node build/scripts/buildIcons.js", { stdio: "inherit" });
    spinner.succeed("Finished running build-icons script");

    // Delete the /src folder
    const buildSrcDir = path.resolve(__dirname, "../src");
    const appSrcDir = path.resolve(__dirname, "../../src");
    if (fs.existsSync(buildSrcDir)) {
        spinner.start("Deleting build source folder (/build/src)...");
        await removeDir(buildSrcDir);
        spinner.succeed("Deleting build source folder");
    }

    // Update version in version.ts
    spinner.start("Updating @advena/sfsymbols package versions...");
    await updateAllPackageVersions(version);
    spinner.succeed(
        `Updated @advena/sfsymbols package versions to new version ${version}`,
    );

    // Clean the dist directory
    spinner.start("Cleaning the dist directory...");
    await removeDir(path.resolve(__dirname, "../../dist"));
    spinner.succeed("Cleaned the dist directory");

    // Compile TypeScript code
    spinner.start("Compiling TypeScript (ESM)...");
    execSync("tsc", { stdio: "inherit" });
    spinner.succeed("Compiled TypeScript (ESM)");
    spinner.start("Compiling TypeScript (CommonJS)...");
    execSync("tsc -p tsconfig.main.json", { stdio: "inherit" });
    spinner.succeed("Compiled TypeScript (CommonJS)");

    // Mangle and minify the source files in /dist
    spinner.start("Compressing build output...");
    execSync(
        "pnpm uglifyjs-folder ../../dist --each -x .js  -o ../../dist --compress --mangle",
        { stdio: "inherit" },
    );
    spinner.succeed("Compressed build output");

    // Minify ESM files in /dist/module
    spinner.start("Minifying ESM files...");
    await minifyFiles(path.resolve(__dirname, "../../dist/module"), "esm");
    spinner.succeed("Minified ESM files");

    // Minify CJS files in /dist/main
    spinner.start("Minifying CJS files...");
    await minifyFiles(path.resolve(__dirname, "../../dist/main"), "cjs");
    spinner.succeed("Minified CJS files");

    // Delete the /src folder again after build
    if (fs.existsSync(appSrcDir)) {
        spinner.start("Deleting application source directory...");
        await removeDir(appSrcDir);
        spinner.succeed("Deleting application source directory");
    }

    // Log completion message
    log("\n✅ All done! The build process completed successfully.");

    // // Quietly run biome on the sfsymbols package directory
    // execSync("biome check . --write --skip-errors --config-path ../../", {
    // 	cwd: path.resolve(__dirname, "../../../"),
    // 	stdio: "inherit",
    // });
};

// Run the build function
build();
