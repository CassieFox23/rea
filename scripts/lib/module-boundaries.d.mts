/** One import, reexport or type import resolved to repository paths. */
export interface ResolvedSourceImport {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
  readonly target: string;
}

/** One dependency crossing a settled source ownership boundary. */
export interface ModuleBoundaryViolation extends ResolvedSourceImport {
  readonly boundary:
    | "artifact-acquisition"
    | "process-capture"
    | "pure-layer"
    | "application-composition"
    | "provider-construction"
    | "provider-generated-catalog";
}

/** Layers that import nothing above them: domain semantics and contracts. */
export const PURE_LAYERS: ReadonlySet<string>;

/** Layers above the providers: shared workflows, composition and the CLI/MCP adapters. */
export const OUTER_LAYERS: ReadonlySet<string>;

/** Root source files that belong to the CLI/MCP adapters. */
export const ADAPTER_ROOT_FILE: RegExp;

/** Provider modules that only composition may construct. */
export const PROVIDER_CONSTRUCTION_FILES: RegExp;

/** Provider roots whose construction moved behind composition. */
export const MIGRATED_PROVIDER_ROOTS: ReadonlySet<string>;

/** Resolve every import, reexport and type import of one source file to repository paths. */
export function resolveSourceImports(
  file: string,
  source: string,
  root: string,
): readonly ResolvedSourceImport[];

/** Check resolved source ownership, including type imports and reexports. */
export function inspectModuleBoundaries(
  file: string,
  source: string,
  root: string,
): readonly ModuleBoundaryViolation[];
