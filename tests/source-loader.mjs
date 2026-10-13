import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceRoot = new URL("../src/", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith(".")) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (candidate.href.startsWith(sourceRoot) && existsSync(fileURLToPath(candidate))) {
      return nextResolve(candidate.href, context);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(sourceRoot) && url.endsWith(".ts")) {
    const source = await readFile(new URL(url), "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    });
    return { format: "module", shortCircuit: true, source: result.outputText };
  }
  return nextLoad(url, context);
}
