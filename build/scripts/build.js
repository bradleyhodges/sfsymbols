const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const chalk = require("chalk");
const ora = require("ora").default;
const inquirer = require("inquirer").default;
const { removeBuildDirectory, writeFileAtomically } = require("./buildFiles");
const { buildPackage } = require("./buildPackage");
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

// Remove generated directories; failures propagate to the build error handler.
const removeDir = async (dir) => {
    spinner.start(`Deleting ${dir}...`);
    await removeBuildDirectory(dir, path.resolve(__dirname, "../.."));
    spinner.succeed(`Deleted ${dir}`);
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
        await writeFileAtomically(
            packageJsonPath,
            `${JSON.stringify(packageJson, null, 2)}\n`,
        );
        log(`Updated package.json to version ${version}`, "yellow");
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
    const packageRootDirectories = [
        path.resolve(__dirname, "../../../icons"),
        path.resolve(__dirname, "../../../react"),
        path.resolve(__dirname, "../../../types"),
    ];

    for (const packageRoot of packageRootDirectories) {
        const packageJsonPath = path.resolve(packageRoot, "package.json");
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(
                fs.readFileSync(packageJsonPath, "utf8"),
            );
            const updates = [];
            if (packageJson.version !== version) {
                updates.push(
                    `Updated ${packageJson.name} from version ${packageJson.version} to ${version}`,
                );
                packageJson.version = version;
            }
            for (const [dependency, currentVersion] of Object.entries(
                packageJson.dependencies || {},
            )) {
                if (
                    dependency.startsWith("@bradleyhodges/sfsymbols") &&
                    currentVersion !== version
                ) {
                    packageJson.dependencies[dependency] = version;
                    updates.push(
                        `Updated ${dependency} from version ${currentVersion} to ${version}`,
                    );
                }
            }
            if (updates.length) {
                await writeFileAtomically(
                    packageJsonPath,
                    `${JSON.stringify(packageJson, null, 2)}\n`,
                );
                for (const message of updates) log(message, "yellow");
            }
        } else {
            log(`No package.json found in ${packageRoot}`, "yellow");
        }

        const versionTsPath = path.resolve(packageRoot, "src/version.ts");
        if (fs.existsSync(versionTsPath)) {
            const content = `export const VERSION = ${JSON.stringify(version)};\n`;
            if (fs.readFileSync(versionTsPath, "utf8") !== content) {
                await writeFileAtomically(versionTsPath, content);
                log(
                    `Updated version.ts in ${packageRoot} to ${version}`,
                    "yellow",
                );
            }
        }
    }
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

    // Update version in version.ts
    spinner.start("Updating @bradleyhodges/sfsymbols package versions...");
    await updateAllPackageVersions(version);
    spinner.succeed(
        `Updated @bradleyhodges/sfsymbols package versions to new version ${version}`,
    );

    // Compile and validate staged outputs before replacing the current distribution.
    spinner.start("Building package outputs...");
    await buildPackage();
    spinner.succeed("Built and validated package outputs");

    // Keep raw SVGs and generated TypeScript until every build stage has succeeded.
    const appSrcDir = path.resolve(__dirname, "../../src");
    const buildSrcDir = path.resolve(__dirname, "../src");
    if (fs.existsSync(appSrcDir)) {
        await removeDir(appSrcDir);
    }
    // Remove the original inputs last, so an earlier cleanup failure still leaves them available.
    if (fs.existsSync(buildSrcDir)) await removeDir(buildSrcDir);

    // Log completion message
    log("\n✅ All done! The build process completed successfully.");

    // // Quietly run biome on the sfsymbols package directory
    // execSync("biome check . --write --skip-errors --config-path ../../", {
    // 	cwd: path.resolve(__dirname, "../../../"),
    // 	stdio: "inherit",
    // });
};

// Run the build function
build().catch((error) => {
    spinner.fail(`Build failed: ${error.message}`);
    process.exitCode = 1;
});
