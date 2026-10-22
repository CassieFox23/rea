import { parse } from "@babel/parser";
import { traverseFast } from "@babel/types";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Layers that import nothing above them: domain semantics and contracts. */
export const PURE_LAYERS = new Set(["domain", "contracts"]);
/** Layers above the providers: shared workflows, composition and the CLI/MCP adapters. */
export const OUTER_LAYERS = new Set([
  "application",
  "composition",
  "server",
  "cli",
  "main",
]);
/** Root source files that belong to the CLI/MCP adapters. */
export const ADAPTER_ROOT_FILE = /^src\/(?:cli|main)\./u;
/** Provider modules that only composition may construct. */
export const PROVIDER_CONSTRUCTION_FILES =
  /^src\/(?:artifacts\/ArtifactProvider|dotnet\/ManagedStaticProvider|native\/NativeMacOSProvider|browser\/[^/]*Provider)\.[^/]+$/u;
/** Provider roots whose construction moved behind composition. */
export const MIGRATED_PROVIDER_ROOTS = new Set([
  "sqlite",
  "evm",
  "go",
  "il2cpp",
  "model",
  "gpu",
  "rust",
  "wasm",
  "captures",
  "signals",
  "android",
  "firmware",
  "ghidra",
  "hopper",
  "ida",
  "inspector",
  "javascript",
]);
const repositoryPath = (root, path) =>
  relative(root, path).replaceAll("\\", "/");

const literalValue = (node) => {
  if (node?.type === "StringLiteral") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
};

const importSpecifier = (node) => {
  switch (node.type) {
    case "ImportDeclaration":
    case "ExportNamedDeclaration":
    case "ExportAllDeclaration":
    case "ImportExpression":
    case "TSImportType":
      return literalValue(node.source);
    case "TSImportEqualsDeclaration":
      return node.moduleReference.type === "TSExternalModuleReference"
        ? literalValue(node.moduleReference.expression)
        : undefined;
    default:
      return undefined;
  }
};

const sourceTarget = (file, specifier) => {
  if (specifier.startsWith("file:")) return fileURLToPath(specifier);
  if (isAbsolute(specifier)) return resolve(specifier);
  return specifier.startsWith(".")
    ? fileURLToPath(new URL(specifier, pathToFileURL(file)))
    : undefined;
};

const failedBoundary = (file, target) => {
  if (!file.startsWith("src/") || !target.startsWith("src/")) return undefined;
  const layer = file.split("/")[1];
  const targetLayer = target.split("/")[1];
  if (
    file.startsWith("src/process/capture/") &&
    (OUTER_LAYERS.has(targetLayer) || ADAPTER_ROOT_FILE.test(target))
  )
    return "process-capture";
  if (
    file.startsWith("src/application/javascript/") &&
    /^src\/artifacts\/(?:Asar|Directory)ArtifactReader\.(?:js|ts)$/u.test(
      target,
    )
  )
    return "provider-construction";
  if (
    (file.startsWith("src/artifacts/javascript/") ||
      file.startsWith("src/artifacts/apple/") ||
      file.startsWith("src/artifacts/inventory/") ||
      file.startsWith("src/artifacts/extraction/") ||
      /^src\/artifacts\/ArtifactHash\.(?:js|ts)$/u.test(file)) &&
    (OUTER_LAYERS.has(targetLayer) || ADAPTER_ROOT_FILE.test(target))
  )
    return "artifact-acquisition";
  if (PURE_LAYERS.has(layer)) {
    if (
      (/^src\/[^/]+\//u.test(target) && !PURE_LAYERS.has(targetLayer)) ||
      ADAPTER_ROOT_FILE.test(target)
    )
      return "pure-layer";
  }
  if (layer === "application" && targetLayer === "composition")
    return "application-composition";
  if (
    (layer === "application" || layer === "server") &&
    (MIGRATED_PROVIDER_ROOTS.has(targetLayer) ||
      PROVIDER_CONSTRUCTION_FILES.test(target))
  )
    return "provider-construction";
  return undefined;
};

/** Resolve every import, reexport and type import of one source file to repository paths. */
export const resolveSourceImports = (file, source, root) => {
  const absoluteFile = resolve(root, file);
  const importer = repositoryPath(root, absoluteFile);
  const tree = parse(source, {
    sourceType: "module",
    plugins: ["typescript"],
  });
  const imports = [];
  traverseFast(tree, (node) => {
    const specifier = importSpecifier(node);
    if (specifier === undefined) return;
    const resolved = sourceTarget(absoluteFile, specifier);
    if (resolved === undefined) return;
    imports.push({
      file: importer,
      line: node.loc?.start.line ?? 1,
      specifier,
      target: repositoryPath(root, resolved),
    });
  });
  return imports;
};

/** Check resolved source ownership, including type imports and reexports. */
export const inspectModuleBoundaries = (file, source, root) => {
  const violations = [];
  for (const dependency of resolveSourceImports(file, source, root)) {
    const boundary = failedBoundary(dependency.file, dependency.target);
    if (boundary !== undefined) violations.push({ ...dependency, boundary });
  }
  return violations;
};
