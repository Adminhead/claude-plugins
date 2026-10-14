// dependency-cruiser rules for package entry-point boundaries.
// Layout: <PACKAGES_ROOT>/<name>/*.ts are a package's entry points (public).
// Anything in a subfolder, such as lib/ or tests/, is private to the package.
// Copy to the repo root as .dependency-cruiser.cjs (.cjs works in "type": "module" repos).

// Edit this to match the repo. Keep the trailing slash off.
const PACKAGES_ROOT = "src/packages";

const R = PACKAGES_ROOT;
// A file inside a package subfolder: <root>/<pkg>/<subfolder>/...
const INTERNALS = `^${R}/[^/]+/[^/]+/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "outside-code-uses-entry-points",
      comment: "Code outside the packages may import only a package's root files.",
      severity: "error",
      from: { pathNot: `^${R}/` },
      to: { path: INTERNALS },
    },
    {
      name: "packages-use-other-packages-through-entry-points",
      comment:
        "A package's own files may import each other freely, but another package only through its root files.",
      severity: "error",
      from: { path: `^${R}/([^/]+)/`, pathNot: `^${R}/[^/]+/tests/` },
      to: { path: INTERNALS, pathNot: `^${R}/$1/` },
    },
    {
      name: "tests-use-entry-points",
      comment:
        "Tests may import any package's root files and their own tests/ fixtures, never internals (their own package's included).",
      severity: "error",
      from: { path: `^${R}/([^/]+)/tests/` },
      to: { path: INTERNALS, pathNot: `^${R}/$1/tests/` },
    },
    {
      name: "tests-folder-is-private",
      comment: "Only tests may import from a tests/ folder.",
      severity: "error",
      from: { pathNot: `^${R}/[^/]+/tests/` },
      to: { path: `^${R}/[^/]+/tests/` },
    },
    {
      name: "no-circular",
      comment: "No dependency cycles.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    // Layering (which package may depend on which) is a separate decision.
    // Add rules here when the repo has one, for example:
    // { name: "ui-not-billing", severity: "error", from: { path: `^${R}/ui/` }, to: { path: `^${R}/billing/` } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    // Count type-only and otherwise unused imports as dependencies too.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".jsx", ".json"] },
  },
};
