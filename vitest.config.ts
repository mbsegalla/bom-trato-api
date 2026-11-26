import ts from 'typescript';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const compilerOptions = ts.parseJsonConfigFileContent(
  ts.readConfigFile('./tsconfig.json', ts.sys.readFile).config,
  ts.sys,
  '.',
).options;

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [
    tsconfigPaths(),
    {
      name: 'nestjs-decorator-metadata',
      enforce: 'pre',
      transform(source, id) {
        if (!id.endsWith('.ts') || id.includes('/node_modules/') || !/^\s*@/m.test(source)) {
          return null;
        }

        const result = ts.transpileModule(source, {
          fileName: id,
          compilerOptions: {
            ...compilerOptions,
            module: ts.ModuleKind.ESNext,
            sourceMap: true,
            inlineSources: true,
          },
        });

        return { code: result.outputText, map: result.sourceMapText ?? null };
      },
    },
  ],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/generated/**', 'src/**/*.module.ts', 'src/main.ts'],
      reporter: ['text', 'html', 'json-summary'],
    },
  },
});
