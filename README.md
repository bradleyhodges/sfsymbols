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
import { arrowUpCircleFill } from '@bradleyhodges/sfsymbols';

...

<SFIcon icon={arrowUpCircleFill} />
```

> [!NOTE]
> This repository contains the scripts necessary to build the icons and their respective React components. However, due to Apple's licensing terms, I have not included the actual icon archive in this repository, and I will not provide it upon request. This is to respect Apple's licensing terms, prevent any unauthorised use of the icons, and to avoid any legal issues.
