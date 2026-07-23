// Test-only ESM resolve hook.
//
// The project source uses extensionless relative imports (e.g. `./booking`),
// which Next/the bundler resolves but Node's native ESM loader does not. This
// hook lets Node's built-in test runner (`node --test`, with its default
// TypeScript type-stripping) resolve those imports to their `.ts` files, so we
// can run real unit/integration tests against src/lib/*.ts with ZERO extra
// dependencies. It is loaded via `--import ./scripts/ts-resolve.mjs` from the
// `test` script and never ships in the app bundle.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    // Only retry bare relative specifiers that lack an explicit extension.
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\\.[a-z0-9]+$/i.test(specifier)) {
      return await next(specifier + '.ts', context);
    }
    throw err;
  }
}
`),
  import.meta.url,
);
