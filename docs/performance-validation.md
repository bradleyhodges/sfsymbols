# Performance and compatibility validation

Validated on 7 September 2026 on Windows, against icons baseline commit `d11cf23e15f6b81f8bc3e6f1c3f99dee789f3523`. Both package versions remain `8.0.4`.

## Changes

- Flattened root declarations retain all named `IconDefinition` exports. Individual declarations and metadata exports remain available.
- CommonJS root exports load their existing leaf module on first access. Export order, descriptors, static named-export discovery, and object identity are preserved.
- Optional typed `sf*` subpaths support ESM and CommonJS. Existing root and categories paths, legacy `main`/`module` entry points, and the runtime dependency contract remain supported.
- ESM relative specifiers include `.js`; only the ESM output directory has a module-type marker. Minification targets ES2015 syntax.
- `build-package` stages, compiles, validates, minifies, and replaces the distribution. `--from-dist` reads and validates the complete existing catalogue before writing new outputs. Normal SVG generation and distribution rebuilding share the same icon source emitter.
- Four minification workers preserve atomic replacement, Windows retries, cleanup, and error propagation. Failures drain active work before returning.
- Aliases load once from `attr/aliases.ts`, are validated as data, and are restored before existing generic keywords without accumulating duplicates.
- The companion React package retains `react`, `cn`, refs, memoization, accessibility, class merging, and customization. Omitted/null size uses positive finite width, then height, then `1em`; explicit sizes, including zero, take precedence. Unused runtime dependencies were removed or moved to development dependencies.

## Catalogue compatibility

A complete baseline was captured before implementation: 8,111 export names in order, root descriptors, every CommonJS leaf export in order, complete icon objects, category mappings, and hashes of all 16,226 declaration files.

Exhaustive comparison confirmed that both output formats preserve every icon name, SVG path, dimension, viewBox, category, variant, and metadata export. All 16,222 individual icon declaration files remain byte-identical. Root declarations were flattened; category declarations have equivalent signatures with different property quoting. CommonJS root order and descriptors match the baseline, and root/leaf metadata references retain identity within each format.

The only permitted icon-data changes are restored curated keywords for `sfArrow3Trianglepath`, `sfArrowUpTrash`, `sfDesktopcomputerAndArrowDown`, `sfDisplayAndArrowDown`, `sfHighlighter`, `sfLaptopcomputerAndArrowDown`, `sfSquareAndArrowDown`, and `sfTrash`. Existing generic keywords are retained.

## Measurements

Measurements are local observations, not guarantees for other machines. Startup, bundle, and minification figures use the median of three runs on Node 24.16.0.

| Measurement | Before | After |
| --- | ---: | ---: |
| CommonJS root evaluation and key enumeration | 2,834 ms | 43 ms |
| Additional heap during root evaluation | 130.7 MiB | 6.0 MiB |
| Icon modules loaded by root evaluation/enumeration | 8,111 | 0 |
| Declaration files loaded by TypeScript | 8,179 | 68 |
| TypeScript declaration-loading memory | 265,948 K | 42,545 K |
| TypeScript declaration-loading total time | 1.068 s | 0.030 s |
| Minification of 400 files, serial vs four workers | 2.562 s | 0.653 s |
| Packed icons archive | 6,286,702 bytes | 6,266,180 bytes |

Startup measurements compile each root in a fresh Node process against the unchanged leaf data, excluding the initial root source read. The old root was taken directly from the baseline commit. Restored keywords are present in the current leaf files. TypeScript 7.0.2 diagnostics use the same options for both declaration roots, including `skipLibCheck` to isolate loading; separate consumer tests check types without skipping library checks.

The minification comparison runs the same helper with one versus four workers, including file reads, transforms, temporary files, and replacement. All three runs produced the same SHA-256 hash across the 400 outputs. This measures minification, not the entire build or SVG optimization.

| Installed-package bundle | Minified | Gzip | Retained icons | Build time |
| --- | ---: | ---: | ---: | ---: |
| Named ESM root import, one icon | 837 bytes | 519 bytes | 1 | 684 ms |
| ESM subpath, same icon | 837 bytes | 519 bytes | 1 | 31 ms |
| CommonJS subpath, same icon | 1,395 bytes | 774 bytes | 1 | 28 ms |
| Named ESM root import, ten icons | 12,247 bytes | 3,229 bytes | 10 | 667 ms |

The one-icon ESM bundle is unchanged from the baseline. The ten-icon sample uses the first ten CommonJS export names. Bundle measurements use esbuild 0.28.2 with browser platform, ESM output, bundling, and minification. Root CommonJS imports remain capable of pulling the whole catalogue into a bundle; the new subpaths provide a small CommonJS bundle without changing existing root behavior.

## Validation performed

- `pnpm test`: 22 icons tests, covering category generation, name validation, bounded minification, retries, failure draining, rollback, alias validation/idempotency, SVG fixtures, ESM leaf metadata, flattened declarations, lazy loading, subpaths, native imports, and tree shaking.
- `pnpm typecheck`: generated declarations checked successfully, including this checkout without generated `src`.
- `pnpm build-package --from-dist`: complete catalogue built and validated in both formats. A second complete rebuild produced byte-identical output across all 32,453 distribution files.
- Focused Biome checks and `node --check` on changed build scripts; `git diff --check`.
- `npm pack --ignore-scripts`: inspected the actual icons and React archives. Icons contain 32,456 entries, including the ESM marker. React test fixtures are excluded, and its original ignore protections remain intact.
- Installed the packed icons archive in a separate consumer directory. CommonJS require/enumeration, subpath identity, native ESM root/subpath imports, and categories passed on Node **16.20.2, 18.20.8, 20.20.2, 22.23.2, and 24.20.0**.
- Packed TypeScript consumers passed with **TypeScript 7.0.2 bundler and NodeNext resolution**, including `.mts` and `.cts`, and **TypeScript 5.9.3 legacy Node resolution** for root imports. Checks use strict mode and `esModuleInterop`, which the existing types package requires for its React default import.
- The React package's `pnpm test` builds both outputs and passes all **8 rendering tests**. Type checking and focused Biome checks pass. Tests cover default/null/explicit sizes, dimensions, metadata immutability, custom paths, colors, opacity, accessibility, props, and class conflicts.
- Installed both packed packages together and rendered an actual icon through React's server renderer. Default `1em`, explicit zero, viewBox, path data, and unchanged icon metadata passed.
- The browser fixture passed forwarded SVG ref, React click handling, ARIA label forwarding, and intrinsic sizing checks. Its rendered output was inspected in a browser.
- React Doctor changed-file scans scored **100/100** in both repositories. The icons scan runs framework-neutral rules because it contains data rather than React components.
- Final independent review found no remaining actionable regressions.

The full original-archive SVG rebuild could not be run because the archive is unavailable. The actual SVG generator was exercised with fixtures, including multiple paths, opacity, variants, curated aliases, and the shared package emitter. No package was published or pushed.
