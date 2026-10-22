import { readdir, readFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { providerCatalog } from "./lib/catalog-builders.mjs";
import { SOURCE_PATHS, loadSources } from "./lib/catalog-core.mjs";
import { formatGeneratedFile } from "./lib/format-generated-file.mjs";
import { ensureGeneratedFile } from "./lib/generated-file.mjs";
import {
  ADAPTER_ROOT_FILE,
  MIGRATED_PROVIDER_ROOTS,
  OUTER_LAYERS,
  PROVIDER_CONSTRUCTION_FILES,
  PURE_LAYERS,
  resolveSourceImports,
} from "./lib/module-boundaries.mjs";

const arguments_ = new Set(process.argv.slice(2));
for (const argument of arguments_)
  if (argument !== "--check" && argument !== "--stdout")
    throw new Error(`Unknown architecture map option: ${argument}`);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chartPath = "docs/architecture.mermaid";
const providersPath = "docs/architecture-providers.md";
const generateCommand = "node scripts/generate-architecture-map.mjs";
const minimumDrawnImports = 10;
const namesPerLabelLine = 7;

const LAYERS = [
  {
    id: "ADAPTERS",
    title: "CLI and MCP adapters",
    summary: "parse a command or MCP call and return the result",
  },
  {
    id: "COMPOSITION",
    title: "Composition",
    summary:
      "production factories construct fresh providers and bind them to the workflows",
  },
  {
    id: "APPLICATION",
    title: "Shared application workflows",
    summary: "CLI/MCP use cases, sessions and investigation records",
  },
  {
    id: "PROVIDERS",
    title: "Provider adapters",
    summary: "each wraps one engine, runtime or file format",
  },
  {
    id: "UNMAPPED",
    title: "Not yet mapped",
    summary:
      "named by neither scripts/lib/module-boundaries.mjs nor the provider catalog",
  },
  {
    id: "CORE",
    title: "Pure core: domain semantics and contracts",
    summary: "imported by every layer, imports nothing above",
  },
];
const layerOrder = LAYERS.map(({ id }) => id);
const OUTER_LAYER_IDS = {
  cli: "ADAPTERS",
  main: "ADAPTERS",
  server: "ADAPTERS",
  composition: "COMPOSITION",
  application: "APPLICATION",
};
for (const layer of OUTER_LAYERS)
  if (!(layer in OUTER_LAYER_IDS))
    throw new Error(`Outer layer ${layer} has no box in the architecture map`);

const sourceFiles = async () => {
  const entries = await readdir(join(root, "src"), { recursive: true });
  return entries
    .map((entry) => entry.split(sep).join("/"))
    .filter(
      (entry) =>
        entry.endsWith(".ts") &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".fixture.ts") &&
        !entry.endsWith(".d.ts"),
    )
    .sort()
    .map((entry) => `src/${entry}`);
};

/** Roots of compiled modules that export a provider identity the catalog lists. */
const catalogProviderRoots = (sources, providers) => {
  const ids = new Set(providers.map(({ id }) => id));
  const roots = new Set();
  for (const [key, module] of Object.entries(sources)) {
    const [, directory, rest] = SOURCE_PATHS[key].split("/");
    if (rest === undefined) continue;
    const exportsIdentity = Object.values(module).some(
      (value) =>
        typeof value === "object" && value !== null && ids.has(value.id),
    );
    if (exportsIdentity) roots.add(directory);
  }
  return roots;
};

/** Map a source path to its top-level directory or root file. */
const unitOf = (path, directories) => {
  const [, second, third] = path.split("/");
  if (third !== undefined) return `src/${second}`;
  const extension = /\.[^.]+$/u;
  const name = second.replace(extension, "");
  return directories.has(name) && !extension.test(second)
    ? `src/${name}`
    : `src/${name}.ts`;
};

const layerOf = (unit, providerRoots) => {
  const name = unit.slice("src/".length);
  if (unit.endsWith(".ts"))
    return ADAPTER_ROOT_FILE.test(unit) ? "ADAPTERS" : "UNMAPPED";
  if (PURE_LAYERS.has(name)) return "CORE";
  if (OUTER_LAYERS.has(name)) return OUTER_LAYER_IDS[name];
  if (providerRoots.has(name)) return "PROVIDERS";
  return "UNMAPPED";
};

const importGraph = async (files, providerRoots) => {
  const directories = new Set(
    files
      .map((file) => file.split("/")[1])
      .filter((name) => !name.endsWith(".ts")),
  );
  const layers = new Map();
  const assign = (unit) => {
    if (!layers.has(unit)) layers.set(unit, layerOf(unit, providerRoots));
    return layers.get(unit);
  };
  const counts = new Map();
  for (const file of files) {
    const source = await readFile(join(root, file), "utf8");
    const from = assign(unitOf(file, directories));
    for (const { target } of resolveSourceImports(file, source, root)) {
      if (!target.startsWith("src/")) continue;
      const to = assign(unitOf(target, directories));
      if (from === to) continue;
      const key = `${from}>${to}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const edges = [...counts]
    .map(([key, count]) => {
      const [from, to] = key.split(">");
      return {
        from,
        to,
        count,
        upward: layerOrder.indexOf(from) > layerOrder.indexOf(to),
      };
    })
    .sort(
      (left, right) =>
        layerOrder.indexOf(left.from) - layerOrder.indexOf(right.from) ||
        layerOrder.indexOf(left.to) - layerOrder.indexOf(right.to),
    );
  return { edges, layers };
};

const memberLines = (units) => {
  const names = units.map((unit) => {
    const name = unit.slice("src/".length);
    return unit.endsWith(".ts") ? name : `${name}/`;
  });
  const lines = [];
  for (let index = 0; index < names.length; index += namesPerLabelLine)
    lines.push(names.slice(index, index + namesPerLabelLine).join(", "));
  return lines.length === 0 ? ["(nothing)"] : lines;
};

const edgeLabel = ({ count, upward }) =>
  upward
    ? `${count} imports, upward: a port or type defined above`
    : `${count} imports`;

const edgeList = (edges) =>
  edges.length === 0
    ? "none"
    : edges.map(({ from, to, count }) => `${from}->${to} ${count}`).join(", ");

const renderChart = ({ edges, layers }) => {
  const members = new Map(layerOrder.map((id) => [id, []]));
  for (const [unit, layer] of [...layers].sort()) members.get(layer).push(unit);
  const drawn = edges.filter(
    ({ to, count }) => to !== "CORE" && count >= minimumDrawnImports,
  );
  const omitted = edges.filter(
    ({ to, count }) => to !== "CORE" && count < minimumDrawnImports,
  );
  const core = edges.filter(({ to }) => to === "CORE");
  const coreTotal = core.reduce((total, { count }) => total + count, 0);
  const lines = [
    "flowchart TD",
    `    %% Generated by scripts/generate-architecture-map.mjs from the import statements in src/ (tests and fixtures skipped). Do not edit by hand: run \`${generateCommand}\` to regenerate it. \`--check\` runs in npm run docs:check.`,
    "    %% Each box is a layer. Its members come from the sets in scripts/lib/module-boundaries.mjs and from the dirs that export a provider identity listed in the compiled catalog. A dir or root file neither names lands in UNMAPPED.",
    "    %% Solid arrow: imports from the layer above to the one below. Dashed arrow: imports upward, a port or type defined above. Each label counts import statements.",
    `    %% Every layer imports the pure core, ${coreTotal} imports in all (${edgeList(core)}), drawn once as the bottom box instead of as arrows.`,
    `    %% Arrows under ${minimumDrawnImports} imports are not drawn: ${edgeList(omitted)}.`,
  ];
  for (const { id, title, summary } of LAYERS) {
    const label = [title, ...memberLines(members.get(id)), summary];
    lines.push(`    ${id}["${label.join("<br/>")}"]`);
  }
  for (const edge of drawn)
    lines.push(
      `    ${edge.from} ${edge.upward ? "-.->" : "-->"}|"${edgeLabel(edge)}"| ${edge.to}`,
    );
  return `${lines.join("\n")}\n`;
};

const renderProviders = (providers, sources) => {
  const kinds = new Map(
    sources.toolContracts.TOOL_CONTRACTS.map(({ name, kind }) => [name, kind]),
  );
  const toolTotal = providers.reduce(
    (total, { capabilities }) => total + capabilities.length,
    0,
  );
  const rows = providers.map(({ id, name, capabilities }) => {
    const kind = [...new Set(capabilities.map((tool) => kinds.get(tool)))]
      .sort()
      .join(", ");
    const tools = capabilities.map((tool) => `\`${tool}\``).join(", ");
    return `| \`${id}\` | ${name} | ${kind} | ${tools} |`;
  });
  return [
    "# Providers",
    "",
    `Generated by \`scripts/generate-architecture-map.mjs\` from the compiled provider catalog: ${providers.length} providers behind ${toolTotal} tool bindings. The kind is the tool family each provider implements. Do not edit by hand: run \`${generateCommand}\` to regenerate it. The layer map is [architecture.mermaid](architecture.mermaid).`,
    "",
    "| Provider | Name | Kind | Tools |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
};

const sources = await loadSources(root);
const providers = providerCatalog(sources);
const files = await sourceFiles();
const providerRoots = new Set([
  ...MIGRATED_PROVIDER_ROOTS,
  ...catalogProviderRoots(sources, providers),
  ...files
    .filter((file) => PROVIDER_CONSTRUCTION_FILES.test(file))
    .map((file) => file.split("/")[1]),
]);
const graph = await importGraph(files, providerRoots);
const chart = renderChart(graph);
const table = await formatGeneratedFile(
  providersPath,
  renderProviders(providers, sources),
);
if (arguments_.has("--stdout")) {
  process.stdout.write(chart);
  process.stdout.write("\n");
  process.stdout.write(table);
} else {
  const check = arguments_.has("--check");
  await ensureGeneratedFile({
    path: join(root, chartPath),
    source: chart,
    check,
    generateCommand,
  });
  await ensureGeneratedFile({
    path: join(root, providersPath),
    source: table,
    check,
    generateCommand,
  });
}
const unmapped = [...graph.layers]
  .filter(([, layer]) => layer === "UNMAPPED")
  .map(([unit]) => unit)
  .sort();
process.stderr.write(
  `${JSON.stringify({
    files: files.length,
    layers: layerOrder.length,
    arrows: graph.edges.length,
    providers: providers.length,
    unmapped,
  })}\n`,
);
