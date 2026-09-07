# SF Symbols 8
SF Symbols is a library of over 7,000 symbols that are designed to integrate seamlessly with San Francisco, the system font for Apple platforms.

> [!CAUTION]
> SF Symbols is licensed by Apple for use only on Apple platforms. **Use of this package, or any of the other @bradleyhodges/sfsymbols-* packages, outside of Apple platforms is NOT permitted.**

## Version
This package has been built using the latest icons from **Version 8.0 (135)** – SF Font Version `22.0d4e4`.

## Usage
For simplicity, **I've created a basic icon browser for this package, which you can access here: [bradleyhodges-sfsymbols.vercel.app](https://bradleyhodges-sfsymbols.vercel.app)**

You will need to install the following packages to use the icons in your project:

- `@bradleyhodges/sfsymbols` – Contains the actual icons.
- `@bradleyhodges/sfsymbols-react` – Contains the React components for the using the icons.
- `@bradleyhodges/sfsymbols-types` – (Optional) Contains the TypeScript types for the icons, if required.

```bash
pnpm add @bradleyhodges/sfsymbols@latest @bradleyhodges/sfsymbols-react@latest @bradleyhodges/sfsymbols-types@latest
```

You can then import the icons in your project like so:

```tsx
import { SFIcon } from '@bradleyhodges/sfsymbols-react';
import { sfArrowUpCircleFill } from '@bradleyhodges/sfsymbols';

...

<SFIcon icon={sfArrowUpCircleFill} />
```

For faster module resolution, you can also import individual icons directly. This is optional; existing root imports remain supported and tree-shake in ESM builds.

```tsx
import { sfArrowUpCircleFill } from '@bradleyhodges/sfsymbols/sfArrowUpCircleFill';
```

CommonJS consumers can use the same per-icon path with `require()`. This keeps bundles focused on the selected icon. Root CommonJS imports load icon definitions when their exports are accessed, but bundlers may still include the whole catalogue.

## Building

- `pnpm build-icons` generates TypeScript definitions from the locally supplied SVG archive.
- `pnpm build-package` compiles generated `src` into validated ESM, CommonJS, and declaration outputs.
- `pnpm build-package --from-dist` rebuilds an existing distribution without the SVG archive. It verifies both formats agree, preserves SVG data and metadata, and restores curated search aliases. Repeated runs do not accumulate aliases.
- `pnpm build` retains the interactive archive/version workflow and uses the same package emitter.
- `pnpm test` runs build regression tests; `pnpm typecheck` checks generated source and shipped declarations, including archive-free checkouts.

Package emission stages and validates all outputs before replacing `dist`. A failed replacement restores the previous distribution; if restoration is blocked, the error identifies the retained backup directory. Original SVG generation still requires your own source archive.

The full `pnpm build` workflow keeps the unpacked SVGs in `build/src` and generated TypeScript in `src` through version updates, compilation, minification, and output validation. Cleanup runs only after those steps succeed, with the original SVG inputs removed last. Package-version files use temporary-file replacement with bounded retries for Windows locks; files already at the requested version are left untouched.

> [!NOTE]
> This repository contains the scripts necessary to build the icons and their respective React components. However, due to Apple's licensing terms, I have not included the actual icon archive in this repository, and I will not provide it upon request. This is to respect Apple's licensing terms, prevent any unauthorised use of the icons, and to avoid any legal issues.
