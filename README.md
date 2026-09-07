<div align="center">

<img src="https://github.com/bradleyhodges/sfsymbols/blob/main/assets/vx-poster-sf-symbols-new-symbols_2x.png?raw=true" alt="SF Symbols 8">

<h1>SF Symbols 8</h1>
<h3>Apple's SF Symbols icons for building React/Typescript applications on Apple platforms.</h3>

<p align="center">
    <a href="#">
				<img alt="NPM Downloads by package author" src="https://img.shields.io/npm-stat/dm/bradleyhodges">
    </a>
    <a href="https://www.npmjs.com/package/@bradleyhodges/sfsymbols">
				<img src="https://img.shields.io/badge/npmjs-package-red?logo=npm" alt="npmjs package">
    </a>
    <a href="https://github.com/bradleyhodges/sfsymbols">
				<img src="https://img.shields.io/badge/github-repo-blue?logo=github" alt="GitHub repo">
    </a>
    <br />
    <a href="https://github.com/bradleyhodges/sfsymbols/releases">
				<img src="https://img.shields.io/badge/version-8.1.1-blue.svg" alt="Version: 8.1.1">
    </a>
    <a href="#">
    <img src="https://img.shields.io/badge/Platforms-iOS%20|%20tvOS%20|%20watchOS%20|%20macOS-FF69B4.svg" alt="Platforms: iOS – tvOS – watchOS – macOS">
    </a>
    <a href="https://github.com/bradleyhodges/sfsymbols/blob/stable/LICENSE">
				<img src="https://img.shields.io/badge/license-MIT-lightgrey.svg" alt="License: MIT">
    </a>
</p>

<p align="center">SF Symbols is a library of over 7,000 symbols that are designed to integrate seamlessly with San Francisco, the system font for Apple platforms.</p>

<p align="center">
    <a href="#-features-of-this-library">Features</a>
  • <a href="#-version">Version</a>
  • <a href="#-available-icons">Available Icons</a>
  • <a href="#-getting-started">🚀 Getting Started</a>
  • <a href="#install-the-packages">Install</a>
  • <a href="#usage">Usage</a>
  • <a href="#building">Buildiung</a>
  • <a href="https://github.com/bradleyhodges/sfsymbols/issues">Issues</a>
  • <a href="https://github.com/bradleyhodges/sfsymbols/pulls">Pull Requests</a>
</p>
</div>

## ⚙️ Features of this Library

- **8,111 Symbols** - Contains the entire SF Symbols 8 (beta) icon library, plus an additional 609 supplementary brand icons
- **Tree-Shakeable** - Each icon can be imported as a standalone component (<1 KB each) or as a bundled import
- **Type-Safe** - Full TypeScript support with IDE autocomplete
- **Lightweight** - Only imported icons end up in your bundle
- **React 18/19** - Works with the latest version of React

## 8️⃣ Version
This package has been built using the latest icons from **Version 8.0 (135)** – SF Font Version `22.0d4e4`.

## 📙 Available Icons
This package contains 8,111 icons, which includes 609 supplementary brand icons. All 7,502 of the `Regular` weight icons from the [San Francisco font](https://github.com/bradleyhodges/SFWindows) are included. Other weights are not included in this package, but the icon weights can be made heavier by applying a stroke to the vector paths.

For simplicity, **I've created a basic icon browser for this package, which you can access here: [bradleyhodges-sfsymbols.vercel.app](https://bradleyhodges-sfsymbols.vercel.app)**
[![Screenshot of a comment on a GitHub issue showing an image, added in the Markdown, of an Octocat smiling and raising a tentacle.](https://github.com/bradleyhodges/sfsymbols/blob/main/assets/icon-browser-screenshot.png?raw=true)](https://bradleyhodges-sfsymbols.vercel.app)

## 🚀 Getting Started

This package features the actual icons and icon data for SF Symbols 8. To use these icons in React applications, you can make use of the [`sfsymbols-react companion package`](https://www.npmjs.com/package/@bradleyhodges/sfsymbols-react), which exposes a convenient, easy-to-use React component for SF Symbols 8 icons.

### Install the Packages

You will need to install the following packages to use the icons in your project:

- [`@bradleyhodges/sfsymbols`](https://www.npmjs.com/package/@bradleyhodges/sfsymbols) – Contains the actual icons.
- [`@bradleyhodges/sfsymbols-react`](https://www.npmjs.com/package/@bradleyhodges/sfsymbols-react) – Contains the React components for the using the icons.
- [`@bradleyhodges/sfsymbols-types`](https://www.npmjs.com/package/@bradleyhodges/sfsymbols-types) – (Optional) Contains the TypeScript types for the icons, if required.


### Usage

> [!CAUTION]
> SF Symbols is licensed by Apple for use only on Apple platforms. **Use of this package, or any of the other @bradleyhodges/sfsymbols-* packages, outside of Apple platforms is NOT permitted. More info: [Xcode and Apple SDKs Agreement](https://www.apple.com/legal/sla/docs/xcode.pdf#page=6&search=System-Provided%20Images) **

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

> [!TIP]
> See the [sfsymbols-react](https://github.com/bradleyhodges/sfsymbols-react) package for detailed information on the properties that the `SFIcon` component accepts and how you can customise the appearance of icons in React applications using the companion component.

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
