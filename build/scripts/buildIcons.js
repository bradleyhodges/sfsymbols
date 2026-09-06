const fs = require("node:fs");
const path = require("node:path");
const { toIconName, validateIconNames } = require("./iconNames");
const { generateCategories, readCategories } = require("./generateCategories");
const { parse } = require("node-html-parser");
const UglifyJS = require("uglify-js");
const { optimize: svgoOptimize } = require("svgo");

// Input paths
const inputDir = path.join(__dirname, "../src/src"); //Location of the svg files exported from SF Symbols on macOS
const brandInputDir = path.join(inputDir, "brands");

// Base package (this npm package) directory
const packageBaseDir = path.join(__dirname, "../../");
const packageSrcDir = path.join(packageBaseDir, "./src");

// Validate and regenerate categories before touching generated icon outputs.
const { icons: sfIconFiles } = generateCategories({ inputDir });
const allCategories = readCategories(
    fs.readFileSync(path.join(packageBaseDir, "./attr/categories.ts"), "utf8"),
);

// Category folders can share icons; build each unique symbol once.
const sfSvgFiles = [...sfIconFiles.keys()].sort().map((name) => `${name}.svg`);

// Discover Brand SVGs (inside the 'brands' sub-directory) – optional
const brandSvgFiles = fs.existsSync(brandInputDir)
    ? fs.readdirSync(brandInputDir).filter((file) => file.endsWith(".svg"))
    : [];

validateIconNames([...sfIconFiles.keys()], brandSvgFiles.map((file) => path.basename(file, ".svg")));

// Output paths
const preparedIconsOutputDir = path.join(packageSrcDir, "./");
const preparedIconsOutputIndexFile = path.join(packageSrcDir, "./index.ts");
const jsonMappingFile = path.join(packageSrcDir, "./mapping.json");
const categoriesFilePath = path.join(packageSrcDir, "_categories.ts");

// ---------------------------------------------------------------------------
// Clean previous *generated* outputs but keep source assets (attr/, categories/)
// ---------------------------------------------------------------------------
if (fs.existsSync(preparedIconsOutputDir)) {
    for (const entry of fs.readdirSync(preparedIconsOutputDir)) {
        const full = path.join(preparedIconsOutputDir, entry);
        // Remove only generated icon definition files (sf*.ts) and *.d.ts produced earlier
        if (fs.statSync(full).isFile() && /^sf.*\.ts$/.test(entry)) {
            fs.rmSync(full, { force: true });
        }
    }
}
// Remove previous barrel file if present
if (fs.existsSync(preparedIconsOutputIndexFile)) {
    fs.rmSync(preparedIconsOutputIndexFile, { force: true });
}
// Remove old mapping
if (fs.existsSync(jsonMappingFile)) {
    fs.rmSync(jsonMappingFile, { force: true });
}
// Ensure output dir exists
if (!fs.existsSync(preparedIconsOutputDir)) {
    fs.mkdirSync(preparedIconsOutputDir, { recursive: true });
}

// Recognised styles
const recognisedStyles = ["fill", "clockwise", "counterclockwise"];
const iconMapping = {};
// Collect barrel-export lines and write once at the end
const indexExports = [];

// Will be initialised after reading directory listings

// Function to extract modifiers from filename
function parseFilename(filename) {
    const baseName = path.basename(filename, ".svg");
    const parts = baseName.split(".");
    const family = parts.slice(0, parts.length - 1).join(".");
    const styleCandidate = parts[parts.length - 1];
    const style = recognisedStyles.includes(styleCandidate)
        ? `${styleCandidate}`
        : null;
    return { baseName, family, style };
}

// Utility to build a stable identifier from a category name
function toCategoryId(name) {
    return name
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
}

// Function to determine which categories an icon belongs to using the loaded data
function getCategories(baseName) {
    const categories = [];
    for (const cat of allCategories) {
        if (Array.isArray(cat.items) && cat.items.includes(baseName)) {
            categories.push(toCategoryId(cat.name));
        }
    }
    return categories;
}

// Function to parse SVG and generate the data
function processSvg(filePath, outputFileName) {
    const content = fs.readFileSync(filePath, "utf-8");

    // If the icon only has one path, optimise it using SVGO (safe defaults; will not drop IDs or viewBox)
    let contentOptimised;
    if (content.includes("path") && content.split("path").length === 2) {
        try {
            const { data: optimisedData } = svgoOptimize(content, {
                multipass: true,
                plugins: [
                    {
                        name: "preset-default",
                        params: {
                            overrides: {
                                mergePaths: false,
                            },
                        },
                    },
                ],
            });
            contentOptimised = optimisedData || content;
        } catch (err) {
            console.warn(
                `SVGO optimisation failed for ${filePath}: ${err.message}. Proceeding with original SVG content.`,
            );
            contentOptimised = content;
        }
    } else {
        // Otherwise, if there's more than one path, don't optimise it
        contentOptimised = content;
    }
    const svgRoot = parse(contentOptimised).querySelector("svg");

    if (!svgRoot) {
        console.error(`No <svg> tag found in ${filePath}`);
        return;
    }

    const { width, height, viewBox } = svgRoot.attributes || {};
    const widthValue = Number.parseFloat(width) || 0;
    const heightValue = Number.parseFloat(height) || 0;

    const pathElements = svgRoot.querySelectorAll("path");
    const svgPathData = pathElements.map((path) => {
        const d = path.attributes.d || "";
        const fill = path.attributes.fill || "";
        const fillOpacity =
            Number.parseFloat(path.attributes["fill-opacity"]) || undefined;
        const obj = { d };
        if (fill) obj.fill = fill;
        if (fillOpacity !== undefined) obj.fillOpacity = fillOpacity;

        // Remove the fill attribute if it does not match "currentColor"
        if (fill !== "currentColor") {
            obj.fill = undefined;
        }

        return obj;
    });

    const { baseName, family, style } = parseFilename(outputFileName);
    const iconName = toIconName(baseName);

    // Get categories
    const categories = getCategories(baseName);

    // Get variants
    const variants = populateVariants(iconName);

    // Retrieve aliases (best-effort – ignore if file not present or not parsable)
    let iconAliases = [];
    try {
        const aliasesPath = path.join(__dirname, "../attr/aliases");
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const aliasesModule = require(aliasesPath);
        const aliasesObj = aliasesModule.aliases || aliasesModule.default || {};
        iconAliases = aliasesObj[iconName] || [];
    } catch (_) {
        // No aliases available – continue gracefully
    }

    // Get aliases
    const keywords = populateGenericAliases(iconName, iconAliases);

    // Generate the output TypeScript file content
    const outputContent = `import type { IconDefinition } from "@bradleyhodges/sfsymbols-types";
const iconName: IconDefinition["iconName"] = "${iconName}";
const sourceName: IconDefinition["sourceName"] = ${JSON.stringify(baseName)};
const family: IconDefinition["family"] = ${JSON.stringify(family)};
const style: IconDefinition["style"] = ${style ? `"${style}"` : null};
const width: IconDefinition["width"] = ${widthValue};
const height: IconDefinition["height"] = ${heightValue};
const viewBox: IconDefinition["viewBox"] = "${viewBox}";
const categories: IconDefinition["categories"] = ${JSON.stringify(categories)};
const svgPathData: IconDefinition["svgPathData"] = ${JSON.stringify(svgPathData)};
const variants: IconDefinition["variants"] = ${JSON.stringify(variants)};
const keywords: IconDefinition["keywords"] = ${JSON.stringify(keywords)};

export const ${iconName}: IconDefinition = {
  iconName,
  sourceName,
  family,
  style,
  width,
  height,
  viewBox,
  categories,
  svgPathData,
  variants,
  keywords
};

export { iconName, sourceName, family, style, width, height, viewBox, categories, svgPathData, variants, keywords };
`;

    // Write to output file
    const outputPath = path.join(preparedIconsOutputDir, `${iconName}.ts`);
    fs.writeFileSync(outputPath, outputContent, "utf-8");
    console.log(`Generated: ${outputPath}`);

    // Queue barrel export – will be written once at the end
    indexExports.push(`export { ${iconName} } from "./${iconName}";`);

    // Add to mapping
    iconMapping[baseName] = iconName;
}

// SECOND_EDIT: add dedicated processor for FontAwesome Brand icons
function processBrandSvg(filePath, fileName) {
    const content = fs.readFileSync(filePath, "utf-8");
    // Optimise SVG using SVGO (reuse safe defaults; will not drop IDs or viewBox)
    let contentOptimised;
    try {
        const { data: optimisedData } = svgoOptimize(content, {
            multipass: true,
        });
        contentOptimised = optimisedData || content;
    } catch (err) {
        console.warn(
            `SVGO optimisation failed for ${filePath}: ${err.message}. Proceeding with original SVG content.`,
        );
        contentOptimised = content;
    }

    const svgRoot = parse(contentOptimised).querySelector("svg");
    if (!svgRoot) {
        console.error(`No <svg> tag found in ${filePath}`);
        return;
    }

    const { width, height, viewBox } = svgRoot.attributes || {};
    const widthValue = Number.parseFloat(width) || 0;
    const heightValue = Number.parseFloat(height) || 0;

    const pathElements = svgRoot.querySelectorAll("path");
    const svgPathData = pathElements.map((path) => {
        const d = path.attributes.d || "";
        const fill = path.attributes.fill || "";
        const fillOpacity =
            Number.parseFloat(path.attributes["fill-opacity"]) || undefined;
        const obj = { d };
        if (fill) obj.fill = fill;
        if (fillOpacity !== undefined) obj.fillOpacity = fillOpacity;
        return obj;
    });

    // Brand icon naming – camelCase with non-alphanumeric stripped, prefixed with 'sfBrand'
    const baseName = path.basename(fileName, ".svg");
    const iconName = toIconName(baseName, true);

    // For brands we treat family as the base name (could be empty string if none)
    const family = baseName;

    // Brands have no style or variants
    const style = null;
    const variants = {};

    // Retrieve generic aliases (best effort)
    const keywords = populateGenericAliases(iconName, []);

    // Hard-code category to "brands" (using toCategoryId keeps it lowercase stable)
    const categories = [toCategoryId("Brands")];

    // Generate output TypeScript content
    const outputContent = `import type { IconDefinition } from "@bradleyhodges/sfsymbols-types";
const iconName: IconDefinition["iconName"] = "${iconName}";
const sourceName: IconDefinition["sourceName"] = ${JSON.stringify(baseName)};
const family: IconDefinition["family"] = ${JSON.stringify(family)};
const style: IconDefinition["style"] = null;
const width: IconDefinition["width"] = ${widthValue};
const height: IconDefinition["height"] = ${heightValue};
const viewBox: IconDefinition["viewBox"] = "${viewBox}";
const categories: IconDefinition["categories"] = ${JSON.stringify(categories)};
const svgPathData: IconDefinition["svgPathData"] = ${JSON.stringify(svgPathData)};
const variants: IconDefinition["variants"] = ${JSON.stringify(variants)};
const keywords: IconDefinition["keywords"] = ${JSON.stringify(keywords)};

export const ${iconName}: IconDefinition = {
  iconName,
  sourceName,
  family,
  style,
  width,
  height,
  viewBox,
  categories,
  svgPathData,
  variants,
  keywords
};

export { iconName, sourceName, family, style, width, height, viewBox, categories, svgPathData, variants, keywords };
`;

    // Write out the generated file
    const outputPath = path.join(preparedIconsOutputDir, `${iconName}.ts`);
    fs.writeFileSync(outputPath, outputContent, "utf-8");
    console.log(`Generated (brand): ${outputPath}`);

    // Export via barrel file
    indexExports.push(`export { ${iconName} } from "./${iconName}";`);

    // Add to mapping
    iconMapping[baseName] = iconName;
}

const iconNameSet = new Set(); // will fill after pre-scan

const populateVariants = (iconName) => {
    const variants = {};
    const isFill = iconName.endsWith("Fill");
    const baseNoFill = isFill ? iconName.slice(0, -4) : iconName; // remove trailing 'Fill'
    const isVariant =
        isFill ||
        iconName.endsWith("Circle") ||
        iconName.endsWith("Square") ||
        iconName.endsWith("Clockwise") ||
        iconName.endsWith("Counterclockwise") ||
        iconName.endsWith("Slash");
    const thisVariantName = iconName.endsWith("Circle")
        ? "Circle"
        : iconName.endsWith("Square")
          ? "Square"
          : iconName.endsWith("Clockwise")
            ? "Clockwise"
            : iconName.endsWith("Counterclockwise")
              ? "Counterclockwise"
              : iconName.endsWith("Slash")
                ? "Slash"
                : null;
    const variantBase =
        isVariant && thisVariantName
            ? iconName.slice(0, -thisVariantName?.length)
            : null;

    // Link back to base (non-fill) variant if current is a fill variant
    if (isFill && iconNameSet.has(baseNoFill)) {
        variants._ = baseNoFill;
    }

    // If the icon is a variant, link back to the base variant
    if (isVariant && variantBase && iconNameSet.has(variantBase)) {
        variants._ = variantBase;
    }

    // --- Shape variants (circle / square) ---
    const shapeRegex = /(Circle|Square)$/;
    let coreShapePrefix = baseNoFill;
    let currentShape = null;
    const match = baseNoFill.match(shapeRegex);
    if (match) {
        currentShape = match[1];
        coreShapePrefix = baseNoFill.slice(0, -currentShape.length);
    }

    const candidateShapes = {
        circle: `${coreShapePrefix}Circle${isFill ? "Fill" : ""}`,
        square: `${coreShapePrefix}Square${isFill ? "Fill" : ""}`,
    };
    // Only keep opposite shape (don't point to self)
    for (const [key, cand] of Object.entries(candidateShapes)) {
        if (cand !== iconName && iconNameSet.has(cand)) {
            variants[key] = cand;
        }
    }

    // --- Rotation variants (clockwise / counterclockwise) ---
    const rotRegex = /(Clockwise|Counterclockwise)$/;
    let coreRotPrefix = baseNoFill;
    let currentRot = null;
    const rotMatch = baseNoFill.match(rotRegex);
    if (rotMatch) {
        currentRot = rotMatch[1];
        coreRotPrefix = baseNoFill.slice(0, -currentRot.length);
    }

    const candidateRot = {
        clockwise: `${coreRotPrefix}Clockwise${isFill ? "Fill" : ""}`,
        counterclockwise: `${coreRotPrefix}Counterclockwise${isFill ? "Fill" : ""}`,
    };
    for (const [key, cand] of Object.entries(candidateRot)) {
        if (cand !== iconName && iconNameSet.has(cand)) {
            variants[key] = cand;
        }
    }

    // --- Slash variant ---
    const candidateSlash = `${baseNoFill}Slash${isFill ? "Fill" : ""}`;
    if (candidateSlash !== iconName && iconNameSet.has(candidateSlash)) {
        variants.slash = candidateSlash;
    }

    // --- Fill variant (if current is not fill) ---
    if (!isFill) {
        const fillCandidate = `${iconName}Fill`;
        if (iconNameSet.has(fillCandidate)) {
            variants.fill = fillCandidate;
        }
    }
    return variants;
};

const populateGenericAliases = (iconName, mainAliases = []) => {
    // Start with any explicitly provided aliases
    const iconAliases = [...mainAliases];

    // If the icon name contains "BadgePlus", add some related aliases
    if (iconName.includes("BadgePlus")) {
        iconAliases.push({
            text: "add",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "new",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "create",
            generic: true,
            priority: 0,
        });
    }

    // If the icon name contains "BadgeMinus", add some related aliases
    if (iconName.includes("BadgeMinus")) {
        iconAliases.push({
            text: "remove",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "delete",
            generic: true,
            priority: 0,
        });
    }

    // If the icon name contains "XMark", add some related aliases
    if (iconName.includes("XMark")) {
        iconAliases.push({
            text: "close",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "error",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "cancel",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "delete",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "remove",
            generic: true,
            priority: 0,
        });
    }

    // If the icon name contains "Exclamationmark", add some related aliases
    if (iconName.includes("Exclamationmark")) {
        iconAliases.push({
            text: "error",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "warning",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "alert",
            generic: true,
            priority: 0,
        });
    }

    // If the icon matches the pattern `sf" + numbers + "Circle/Square"` (including the "fill" variants), then add a "number" alias
    if (
        iconName.match(/^sf\d+Circle$/) ||
        iconName.match(/^sf\d+Square$/) ||
        iconName.match(/^sf\d+CircleFill$/) ||
        iconName.match(/^sf\d+SquareFill$/) ||
        iconName.match(/^sf\d+AltCircle$/) ||
        iconName.match(/^sf\d+AltSquare$/) ||
        iconName.match(/^sf\d+AltCircleFill$/) ||
        iconName.match(/^sf\d+AltSquareFill$/)
    ) {
        iconAliases.push({
            text: "number",
            generic: true,
            priority: 0,
        });
        iconAliases.push({
            text: "digit",
            generic: true,
            priority: 0,
        });
    }

    return iconAliases;
};

// Build a Set of all icon base names (without styles) for both SF and Brand icons
const iconBaseNamesSet = new Set([
    ...sfSvgFiles.map((file) => parseFilename(file).baseName),
    ...brandSvgFiles.map((file) => path.basename(file, ".svg")),
]);

// Populate iconNameSet for existence checks (variants) – include correct prefixes
for (const bn of sfSvgFiles.map((file) => parseFilename(file).baseName)) {
    iconNameSet.add(toIconName(bn));
}
for (const bn of brandSvgFiles.map((file) => path.basename(file, ".svg"))) {
    iconNameSet.add(toIconName(bn, true));
}

// --- Process SF Symbol icons ---
for (const file of sfSvgFiles) {
    const filePath = sfIconFiles.get(path.basename(file, ".svg"));
    processSvg(filePath, file);
}

// --- Process Brand icons ---
for (const file of brandSvgFiles) {
    const filePath = path.join(brandInputDir, file);
    processBrandSvg(filePath, file);
}

// Write JSON mapping file (already compact – gzip on publish will handle size)
fs.writeFileSync(jsonMappingFile, JSON.stringify(iconMapping), "utf-8");
console.log(`Generated icon mapping file: ${jsonMappingFile}`);

// Generate _categories.ts file using the in-memory categories data
function generateCategoriesFile() {
    const uniqueCategories = allCategories.map((cat) => ({
        key: toCategoryId(cat.name),
        name: cat.name,
    }));

    const categoryMappings = {};
    for (const cat of allCategories) {
        const key = toCategoryId(cat.name);
        const icons = (cat.items || [])
            .filter((name) => name in iconMapping)
            .map((name) => iconMapping[name]);
        categoryMappings[key] = icons;
    }

    // ---------------------- Brands category ----------------------
    if (brandSvgFiles.length > 0) {
        const brandKey = toCategoryId("Brands");

        // Add to uniqueCategories only if not already present
        if (!uniqueCategories.some((c) => c.key === brandKey)) {
            uniqueCategories.push({ key: brandKey, name: "Brands" });
        }

        // Map brand icons (base names) to generated icon names via iconMapping
        const brandIcons = brandSvgFiles
            .map((file) => path.basename(file, ".svg"))
            .filter((baseName) => baseName in iconMapping)
            .map((baseName) => iconMapping[baseName]);

        categoryMappings[brandKey] = brandIcons;
    }

    const categoriesFileContent = UglifyJS.minify(`
export const uniqueCategories = ${JSON.stringify(uniqueCategories)};
export const categoryMappings = ${JSON.stringify(categoryMappings)};
`).code;

    fs.writeFileSync(categoriesFilePath, categoriesFileContent, "utf-8");
    console.log(`Generated categories file: ${categoriesFilePath}`);
}

// Call the function at the end of the script
generateCategoriesFile();

// Write barrel file
fs.writeFileSync(
    preparedIconsOutputIndexFile,
    indexExports.join("\n"),
    "utf-8",
);
console.log(`Generated barrel file: ${preparedIconsOutputIndexFile}`);
