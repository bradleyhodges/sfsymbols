# SF Symbols 7
SF Symbols is a library of over 6,900 symbols that are designed to integrate seamlessly with San Francisco, the system font for Apple platforms.

> [!WARNING]
> SF Symbols is licensed by Apple for use only on Apple platforms. **Use of this package, or any of the other @bradleyhodges/sfsymbols-* packages, outside of Apple platforms is NOT permitted.**

## Version
This package has been built using the latest icons from **Version 7.0 (beta)** – SF Font Version `20.0d10e1`.

## Usage
You will need to install the following packages to use the icons in your project:

- `@advena/sfsymbols` – Contains the actual icons.
- `@advena/sfsymbols-react` – Contains the React components for the using the icons.
- `@advena/sfsymbols-types` – (Optional) Contains the TypeScript types for the icons, if required.

```bash
pnpm add @advena/sfsymbols@latest @advena/sfsymbols-react@latest @advena/sfsymbols-types@latest
```

You can then import the icons in your project like so:

```tsx
import { SFIcon } from '@advena/sfsymbols-react';
import { arrowUpCircleFill } from '@advena/sfsymbols';

...

<SFIcon icon={arrowUpCircleFill} />
```