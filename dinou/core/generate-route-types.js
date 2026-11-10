// dinou/core/generate-route-types.js
import fs from "node:fs";
import path from "node:path";

const PAGE_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js", ".mjs"];
const LAYOUT_FUNCTIONS_NAMES = ["layout_functions", "layout.functions"];
const VALID_IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function hasEntryFile(entries, baseNames) {
  const names = Array.isArray(baseNames) ? baseNames : [baseNames];
  return entries.some(
    (e) =>
      !e.isDirectory() &&
      names.some((base) => PAGE_EXTENSIONS.some((ext) => e.name === `${base}${ext}`))
  );
}

function formatTsKey(key) {
  return VALID_IDENTIFIER_RE.test(key) ? key : JSON.stringify(key);
}

function extractParamsFromSegments(segments) {
  const params = {};
  for (const seg of segments) {
    if (seg.startsWith("[[...") && seg.endsWith("]]")) {
      const paramName = seg.slice(5, -2);
      params[paramName] = "string[] | undefined";
    } else if (seg.startsWith("[[") && seg.endsWith("]]")) {
      const paramName = seg.slice(2, -2);
      params[paramName] = "string | undefined";
    } else if (seg.startsWith("[...") && seg.endsWith("]")) {
      const paramName = seg.slice(4, -1);
      params[paramName] = "string[]";
    } else if (seg.startsWith("[") && seg.endsWith("]")) {
      const paramName = seg.slice(1, -1);
      params[paramName] = "string";
    }
  }
  return params;
}

function formatParamsMapEntries(paramsMap) {
  const sortedPaths = Object.keys(paramsMap).sort();
  return sortedPaths
    .map((rPath) => {
      const pObj = paramsMap[rPath];
      const keys = Object.keys(pObj);
      if (keys.length === 0) {
        return `    ${JSON.stringify(rPath)}: Record<string, never>;`;
      }
      const props = keys
        .map((k) => {
          const isOptional = pObj[k].includes("undefined");
          const cleanType = pObj[k].replace(" | undefined", "");
          return `${formatTsKey(k)}${isOptional ? "?" : ""}: ${cleanType}`;
        })
        .join("; ");
      return `    ${JSON.stringify(rPath)}: { ${props} };`;
    })
    .join("\n");
}

function formatLayoutSlotsEntries(layoutPaths, slotNamesBySegment) {
  const sortedPaths = [...layoutPaths].sort();
  return sortedPaths
    .map((lPath) => {
      const slotSet = slotNamesBySegment.get(lPath);
      if (!slotSet || slotSet.size === 0) {
        return `    ${JSON.stringify(lPath)}: {};`;
      }
      const slotProps = Array.from(slotSet)
        .sort()
        .map((sName) => `${formatTsKey(sName)}?: ReactNode`)
        .join("; ");
      return `    ${JSON.stringify(lPath)}: { ${slotProps} };`;
    })
    .join("\n");
}

/**
 * Inspects a parallel `@slot` folder (supporting nested route groups `(group)`
 * and optional trailing segments `[[opt]]` / `[[...opt]]`) for `page.*` and `error.*`.
 */
function inspectSlotDirectory(
  slotDir,
  extraSegments = [],
  state = { hasPage: false, hasError: false, extraSegments: [] }
) {
  if (!fs.existsSync(slotDir)) return state;

  let entries;
  try {
    entries = fs.readdirSync(slotDir, { withFileTypes: true });
  } catch (e) {
    return state;
  }

  const foundPage = hasEntryFile(entries, "page");
  const foundError = hasEntryFile(entries, "error");

  if (foundPage) {
    state.hasPage = true;
    for (const seg of extraSegments) {
      if (!state.extraSegments.includes(seg)) {
        state.extraSegments.push(seg);
      }
    }
  }
  if (foundError) {
    state.hasError = true;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith("_") || name.startsWith("@")) continue;

    if (name.startsWith("(") && name.endsWith(")")) {
      inspectSlotDirectory(path.join(slotDir, name), extraSegments, state);
    } else if (name.startsWith("[[") && name.endsWith("]]")) {
      inspectSlotDirectory(path.join(slotDir, name), [...extraSegments, name], state);
    }
  }

  return state;
}

/**
 * Recursively scans directory to collect all navigable `page.*` routes according to Dinou conventions.
 * - Ignores folders starting with '_' (private folders)
 * - Ignores folders starting with '@' (parallel route slots)
 * - Transparently handles route groups '(group)' by stripping them from URL paths
 * - Tracks dynamic parameters: [id], [...slug], [[slug]], [[...slug]]
 */
function collectRoutes(dir, segments = [], routes = []) {
  const topology = collectRouteTopology(dir, segments);
  routes.push(...topology.routes);
  return routes;
}

/**
 * Single-pass horizontal & hierarchical topology scanner across `src/`:
 * - `routes`: navigable URLs (`page.*`) for Level 1 (`<Link>`, `router.push`)
 * - `pageSegments`: `page.*`, `page_functions.*`, and `not_found.*` segments for `PageProps` / `PageFunctions`
 * - `layouts`: `layout.*` and `layout_functions.*` segments (including intermediate layouts without a sibling `page.*`)
 * - `slots`: parallel `@slot` segments (`@slot/page.*`) and parent layout slot injection map
 * - `errorSegments`: all segments capable of hosting an `error.*` boundary (including `@slot/error.*` and intermediate folders)
 */
function collectRouteTopology(
  dir,
  segments = [],
  topology = {
    routes: [],
    pageSegments: [],
    layouts: [],
    slots: [],
    errorSegments: [],
    slotNamesBySegment: new Map(),
  }
) {
  if (!fs.existsSync(dir)) return topology;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return topology;
  }

  const segmentPath = segments.length === 0 ? "/" : "/" + segments.join("/");

  const hasPage = hasEntryFile(entries, "page");
  const hasPageFunctions = hasEntryFile(entries, "page_functions");
  const hasNotFound = hasEntryFile(entries, "not_found");
  const hasLayout = hasEntryFile(entries, "layout");
  const hasLayoutFunctions = hasEntryFile(entries, LAYOUT_FUNCTIONS_NAMES);
  const hasError = hasEntryFile(entries, "error");

  if (hasPage) {
    topology.routes.push({
      path: segmentPath,
      segments: [...segments],
    });
  }

  if (hasPage || hasPageFunctions || hasNotFound) {
    topology.pageSegments.push({
      path: segmentPath,
      segments: [...segments],
    });
  }

  if (hasLayout || hasLayoutFunctions) {
    topology.layouts.push({
      path: segmentPath,
      segments: [...segments],
    });
  }

  if (hasError || hasPage || hasNotFound || hasLayout || hasLayoutFunctions) {
    topology.errorSegments.push({
      path: segmentPath,
      segments: [...segments],
    });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const name = entry.name;
    // Ignore private folders (_*)
    if (name.startsWith("_")) continue;

    // Parallel route slots: @slot
    if (name.startsWith("@")) {
      const slotName = name.slice(1);
      if (!slotName) continue;

      const slotState = inspectSlotDirectory(path.join(dir, name));
      const slotPath =
        (segments.length === 0 ? "" : "/" + segments.join("/")) + "/@" + slotName;
      const slotDetailedPath =
        slotState.extraSegments.length > 0
          ? `${slotPath}/${slotState.extraSegments.join("/")}`
          : null;
      const slotCombinedSegments = [...segments, ...slotState.extraSegments];

      if (slotState.hasPage) {
        if (!topology.slotNamesBySegment.has(segmentPath)) {
          topology.slotNamesBySegment.set(segmentPath, new Set());
        }
        topology.slotNamesBySegment.get(segmentPath).add(slotName);

        topology.slots.push({
          path: slotPath,
          parentPath: segmentPath,
          slotName,
          segments: slotCombinedSegments,
        });
        if (slotDetailedPath) {
          topology.slots.push({
            path: slotDetailedPath,
            parentPath: segmentPath,
            slotName,
            segments: slotCombinedSegments,
          });
        }
      }

      if (slotState.hasPage || slotState.hasError) {
        topology.errorSegments.push({
          path: slotPath,
          segments: slotCombinedSegments,
        });
        if (slotDetailedPath) {
          topology.errorSegments.push({
            path: slotDetailedPath,
            segments: slotCombinedSegments,
          });
        }
      }
      continue;
    }

    // Route groups: (group) - do not add to URL path
    if (name.startsWith("(") && name.endsWith(")")) {
      collectRouteTopology(path.join(dir, name), segments, topology);
      continue;
    }

    collectRouteTopology(path.join(dir, name), [...segments, name], topology);
  }

  return topology;
}

/**
 * Generates TypeScript type definitions for all discovered routes, layouts, parallel slots, and error boundaries.
 * Accepts either a full `topology` object from `collectRouteTopology` or a legacy `routes` array.
 */
function generateRouteDefinitions(routesOrTopology) {
  const isLegacyArray = Array.isArray(routesOrTopology);
  const routes = isLegacyArray ? routesOrTopology : routesOrTopology?.routes || [];
  const pageSegments = isLegacyArray ? routes : routesOrTopology?.pageSegments || routes;
  const layouts = isLegacyArray ? [] : routesOrTopology?.layouts || [];
  const slots = isLegacyArray ? [] : routesOrTopology?.slots || [];
  const errorSegments = isLegacyArray ? routes : routesOrTopology?.errorSegments || [];
  const slotNamesBySegment = isLegacyArray
    ? new Map()
    : routesOrTopology?.slotNamesBySegment || new Map();

  const staticRoutes = new Set();
  const dynamicTemplateRoutes = new Set();
  const navigableParamsMap = {};
  const routeParamsMap = {};
  const layoutParamsMap = {};
  const slotParamsMap = {};
  const errorParamsMap = {};

  // 1. Level 1 navigable URLs & navigable pattern params (strictly from `page.*` routes)
  for (const route of routes) {
    const segments = route.segments;
    navigableParamsMap[route.path] = {
      ...(navigableParamsMap[route.path] || {}),
      ...extractParamsFromSegments(segments),
    };
    const isDynamic = segments.some((s) => s.startsWith("[") && s.endsWith("]"));

    if (!isDynamic) {
      staticRoutes.add(route.path);
    } else {
      const transformedSegments = segments.map((seg) => {
        if (seg.startsWith("[[...") && seg.endsWith("]]")) {
          return "${string}";
        } else if (seg.startsWith("[[") && seg.endsWith("]]")) {
          return "${string | number}";
        } else if (seg.startsWith("[...") && seg.endsWith("]")) {
          return "${string}";
        } else if (seg.startsWith("[") && seg.endsWith("]")) {
          return "${string | number}";
        }
        return seg;
      });

      dynamicTemplateRoutes.add("`/" + transformedSegments.join("/") + "`");

      // Progressively peel off trailing optional segments to register valid intermediate variants
      let cur = [...segments];
      while (
        cur.length > 0 &&
        cur[cur.length - 1].startsWith("[[") &&
        cur[cur.length - 1].endsWith("]]")
      ) {
        cur.pop();
        if (cur.length === 0) {
          staticRoutes.add("/");
        } else if (!cur.some((s) => s.startsWith("[") && s.endsWith("]"))) {
          staticRoutes.add("/" + cur.join("/"));
        } else {
          const transformed = cur.map((seg) => {
            if (seg.startsWith("[[...") && seg.endsWith("]]")) return "${string}";
            if (seg.startsWith("[[") && seg.endsWith("]]")) return "${string | number}";
            if (seg.startsWith("[...") && seg.endsWith("]")) return "${string}";
            if (seg.startsWith("[") && seg.endsWith("]")) return "${string | number}";
            return seg;
          });
          dynamicTemplateRoutes.add("`/" + transformed.join("/") + "`");
        }
      }
    }
  }

  // 2. Level 2 Page & NotFound parameters (`DinouRouteParamsMap`)
  for (const segEntry of pageSegments) {
    routeParamsMap[segEntry.path] = {
      ...(routeParamsMap[segEntry.path] || {}),
      ...extractParamsFromSegments(segEntry.segments),
    };
  }

  // 3. Level 2 Layout segment parameters (`DinouLayoutParamsMap`)
  for (const layoutEntry of layouts) {
    layoutParamsMap[layoutEntry.path] = {
      ...(layoutParamsMap[layoutEntry.path] || {}),
      ...extractParamsFromSegments(layoutEntry.segments),
    };
  }

  // 4. Level 2 Parallel `@slot` parameters (`DinouSlotParamsMap`)
  for (const slotEntry of slots) {
    slotParamsMap[slotEntry.path] = {
      ...(slotParamsMap[slotEntry.path] || {}),
      ...extractParamsFromSegments(slotEntry.segments),
    };
  }

  // 5. Level 2 Error boundary parameters (`DinouErrorParamsMap`)
  for (const errEntry of errorSegments) {
    errorParamsMap[errEntry.path] = {
      ...(errorParamsMap[errEntry.path] || {}),
      ...extractParamsFromSegments(errEntry.segments),
    };
  }

  return {
    staticRoutes: Array.from(staticRoutes).sort(),
    dynamicRoutes: Array.from(dynamicTemplateRoutes).sort(),
    navigableParamsMap,
    routeParamsMap,
    layoutParamsMap,
    slotParamsMap,
    errorParamsMap,
    slotNamesBySegment,
  };
}

/**
 * Generates the .dinou/types/routes.d.ts ambient definitions file.
 * @param {string} projectRoot Root directory of the project (default process.cwd())
 */
function generateRouteTypes(projectRoot = process.cwd()) {
  const srcDir = path.resolve(projectRoot, "src");
  if (!fs.existsSync(srcDir)) return;

  const topology = collectRouteTopology(srcDir);
  const {
    staticRoutes,
    dynamicRoutes,
    navigableParamsMap,
    routeParamsMap,
    layoutParamsMap,
    slotParamsMap,
    errorParamsMap,
    slotNamesBySegment,
  } = generateRouteDefinitions(topology);

  const staticUnion =
    staticRoutes.length > 0
      ? staticRoutes.map((r) => `  | ${JSON.stringify(r)}`).join("\n")
      : "  | string";

  const dynamicUnion =
    dynamicRoutes.length > 0
      ? dynamicRoutes.map((r) => `  | ${r}`).join("\n")
      : "  | never";

  const navigableParamsEntries = formatParamsMapEntries(navigableParamsMap);
  const paramsEntries = formatParamsMapEntries(routeParamsMap);
  const layoutParamsEntries = formatParamsMapEntries(layoutParamsMap);
  const layoutSlotsEntries = formatLayoutSlotsEntries(
    Object.keys(layoutParamsMap),
    slotNamesBySegment
  );
  const slotParamsEntries = formatParamsMapEntries(slotParamsMap);
  const errorParamsEntries = formatParamsMapEntries(errorParamsMap);

  const formatInterfaceBody = (body) => (body ? `\n${body}\n  ` : "");

  const content = `// This file is auto-generated by Dinou. Do not edit directly.
import type { ReactNode } from "react";
import "dinou";

declare module "dinou" {
  export type DinouStaticRoutes =
${staticUnion};

  export type DinouDynamicRoutes =
${dynamicUnion};

  export type DinouInternalRoute = DinouStaticRoutes | DinouDynamicRoutes;

  export type DinouRelativeOrExternalRoute =
    | \`http://\${string}\`
    | \`https://\${string}\`
    | \`mailto:\${string}\`
    | \`tel:\${string}\`
    | \`#\${string}\`
    | \`?\${string}\`;

  export type DinouGeneratedRoute =
    | DinouStaticRoutes
    | ((
        | DinouDynamicRoutes
        | \`\${DinouInternalRoute}?\${string}\`
        | \`\${DinouInternalRoute}#\${string}\`
        | DinouRelativeOrExternalRoute
      ) & Record<never, never>);

  export interface DinouNavigableParamsMap {${formatInterfaceBody(navigableParamsEntries)}}

  export interface DinouRouteParamsMap {${formatInterfaceBody(paramsEntries)}}

  export interface DinouLayoutParamsMap {${formatInterfaceBody(layoutParamsEntries)}}

  export interface DinouLayoutSlotsMap {${formatInterfaceBody(layoutSlotsEntries)}}

  export interface DinouSlotParamsMap {${formatInterfaceBody(slotParamsEntries)}}

  export interface DinouErrorParamsMap {${formatInterfaceBody(errorParamsEntries)}}

  namespace DinouRouter {
    interface Register {
      route: DinouGeneratedRoute;
      navigableParams: DinouNavigableParamsMap;
      params: DinouRouteParamsMap;
      layoutParams: DinouLayoutParamsMap;
      layoutSlots: DinouLayoutSlotsMap;
      slotParams: DinouSlotParamsMap;
      errorParams: DinouErrorParamsMap;
    }
  }
}
`;

  // Write .dinou/types/routes.d.ts
  const typesDir = path.resolve(projectRoot, ".dinou/types");
  try {
    fs.mkdirSync(typesDir, { recursive: true });
    const targetFile = path.join(typesDir, "routes.d.ts");
    const currentContent = fs.existsSync(targetFile)
      ? fs.readFileSync(targetFile, "utf8")
      : "";
    if (currentContent !== content) {
      fs.writeFileSync(targetFile, content, "utf8");
    }
  } catch (e) {
    if (process.env.DINOU_DEBUG) {
      console.warn("[Dinou] Could not write .dinou/types/routes.d.ts:", e.message);
    }
  }

  return {
    staticCount: staticRoutes.length,
    dynamicCount: dynamicRoutes.length,
    totalRoutes: topology.routes.length,
    layoutCount: Object.keys(layoutParamsMap).length,
    slotCount: Object.keys(slotParamsMap).length,
  };
}

export {
  collectRoutes,
  collectRouteTopology,
  generateRouteDefinitions,
  generateRouteTypes,
};
export default {
  collectRoutes,
  collectRouteTopology,
  generateRouteDefinitions,
  generateRouteTypes,
};
