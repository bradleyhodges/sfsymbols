/** Convert a source basename to a portable TypeScript identifier with a fixed prefix. */
function toIconName(sourceName, brand = false) {
    if (typeof sourceName !== "string" || !/[a-zA-Z0-9]/.test(sourceName)) {
        throw new Error(`Icon name must contain an ASCII letter or digit: ${JSON.stringify(sourceName)}`);
    }
    const suffix = sourceName
        .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "")
        .replace(/[^a-zA-Z0-9]+([a-zA-Z0-9])/g, (_, letter) => letter.toUpperCase())
        .replace(/^./, (letter) => letter.toUpperCase());
    const name = `${brand ? "sfBrand" : "sf"}${suffix}`;
    if (!/^sf[A-Za-z0-9]+$/.test(name)) throw new Error(`Invalid generated identifier: ${name}`);
    return name;
}

/** Validate the complete export namespace before any generated outputs are removed. */
function validateIconNames(symbols, brands) {
    const names = new Map();
    for (const [sources, brand] of [[symbols, false], [brands, true]]) {
        for (const source of sources) {
            const name = toIconName(source, brand);
            // Output paths must also be unique on case-insensitive filesystems.
            const key = name.toLowerCase();
            const origin = `${brand ? "brand" : "symbol"} ${JSON.stringify(source)}`;
            if (names.has(key)) throw new Error(`Icon export collision: ${names.get(key)} and ${origin} both produce ${name}`);
            names.set(key, origin);
        }
    }
}

module.exports = { toIconName, validateIconNames };
