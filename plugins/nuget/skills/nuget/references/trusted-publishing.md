# Packing and trusted publishing to nuget.org

Adapted from the upstream `nuget-trusted-publishing` skill and its references (dotnet/skills); trusted-publishing details checked against the NuGet docs (Context7, `NuGet/docs.microsoft.com-nuget`), action versions against their GitHub releases.

Read this when preparing a package for `dotnet pack`, setting up a GitHub Actions publish job, or replacing a long-lived `NUGET_API_KEY` secret with OIDC. Trusted publishing is nuget.org only; private feeds and Azure Artifacts use their own auth. For hardening the rest of the workflow (SHA pinning, permissions, triggers), use `gh-actions`.

Never delete an API-key secret, a tag, a release or change a `PackageId` without the user's go-ahead: package IDs and published versions are permanent on nuget.org (versions can be unlisted, not reused).

## 1. Assess the packable projects

Check each `.csproj` and `Directory.Build.props` (metadata is often repo-wide). Classify in this order, since an MCP server is also a tool:

| Signal | Type | Also required |
| --- | --- | --- |
| `<PackageType>Template</PackageType>` | Template package | `content/<name>/.template.config/template.json` with `identity`, `name`, `shortName`, `tags.type`; `IncludeBuildOutput=false` |
| `<PackageType>McpServer</PackageType>` | MCP server (a dotnet tool) | `PackAsTool`, `.mcp/server.json` packed to `/.mcp/`, its `version` fields equal to `<Version>` |
| `<PackAsTool>true</PackAsTool>` | Dotnet tool | `OutputType=Exe`; `ToolCommandName` recommended (defaults to the assembly name) |
| Library (`IsPackable` default true) | Library | |
| `OutputType=Exe` plus `IsPackable=true` | Application package | Not installable with `dotnet tool install` |
| `OutputType=Exe` alone | Not packable by default | Ask whether it should be published |

Every package needs `PackageId` (defaults to `AssemblyName`) and `Version`. Recommended: `Authors`, `Description`, `PackageTags`, `PackageLicenseExpression` (SPDX), `RepositoryUrl`, `PackageReadmeFile`, and deterministic, source-linked builds (`ContinuousIntegrationBuild=true` in CI; SourceLink is built into the .NET 8+ SDK for GitHub-hosted repos).

`PackageReadmeFile` also needs the file packed:

```xml
<PropertyGroup>
  <PackageReadmeFile>README.md</PackageReadmeFile>
</PropertyGroup>
<ItemGroup>
  <None Include="../../README.md" Pack="true" PackagePath="/" />
</ItemGroup>
```

Look for existing publish workflows: `grep -rn -E 'nuget push|dotnet pack' .github/workflows/`.

## 2. Pack and check locally

A bad first publish burns a version number, so always pack first:

```bash
dotnet pack -c Release -o ./artifacts
unzip -l ./artifacts/*.nupkg          # check lib/, README, LICENSE, .mcp/server.json
# Tools and MCP servers: install from the folder, run, uninstall
dotnet tool install --tool-path ./.tooltest --add-source ./artifacts <PackageId>
./.tooltest/<command> --help && rm -rf ./.tooltest
```

## 3. The nuget.org policy (the user does this)

On nuget.org: username menu, **Trusted Publishing**, add a policy:

- **Repository Owner** and **Repository**: from the GitHub URL.
- **Workflow File**: the file name only, such as `publish.yml`, not `.github/workflows/publish.yml` and not the workflow's `name:`. Case-insensitive.
- **Environment**: only if the job uses `environment:`; leave blank otherwise.

The policy belongs to the user or an organization; an org policy covers the org's packages. For a private repo, a new policy is "temporarily active" for 7 days and becomes permanent after the first successful publish (which supplies the repo and owner IDs); the window can be restarted.

Optional but recommended: a GitHub environment `release` with required reviewers, holding the secret `NUGET_USER` (the nuget.org profile name, not the email address).

Wait for the user to confirm the policy exists before running the workflow or removing old secrets. Drafting the workflow before that is fine.

## 4. The workflow

```yaml
name: Publish to NuGet

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: release
    permissions:
      id-token: write   # OIDC token for NuGet/login; without it login fails with 403
      contents: read    # setting permissions drops the defaults, so state this
    steps:
      # Pin each action to a full commit SHA (see gh-actions); tags shown for readability
      - uses: actions/checkout@v7
      - uses: actions/setup-dotnet@v6
        with:
          global-json-file: global.json   # or dotnet-version: '10.0.x'
      - name: Check tag matches project version
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          VER=$(dotnet msbuild src/MyLib/MyLib.csproj -getProperty:Version)
          [ "$TAG" = "$VER" ] || { echo "::error::tag $TAG != project version $VER"; exit 1; }
      - run: dotnet pack src/MyLib/MyLib.csproj -c Release -o ./artifacts -p:ContinuousIntegrationBuild=true
      - name: NuGet login (OIDC)
        id: login
        uses: NuGet/login@v1
        with:
          user: ${{ secrets.NUGET_USER }}
      - run: dotnet nuget push ./artifacts/*.nupkg --api-key "${{ steps.login.outputs.NUGET_API_KEY }}" --source https://api.nuget.org/v3/index.json --skip-duplicate
```

- The temporary key lasts 1 hour and each OIDC token buys one key, so log in right before the push.
- `--skip-duplicate` keeps re-runs idempotent.
- Keep CI (build and test on PRs) in a separate workflow without `id-token: write`.
- Several packages: one job packing all of them, or a matrix; one policy per workflow file covers every package the policy owner owns.

Migrating an existing workflow: add the `permissions` block (and `environment` if the policy names one), insert the `NuGet/login` step before the push, and replace `secrets.NUGET_API_KEY` with `steps.login.outputs.NUGET_API_KEY`. Delete the old secret and revoke the API key on nuget.org only after a publish through OIDC has succeeded and the user agrees.

Release: bump `<Version>` (and `server.json` for MCP servers), commit, `git tag v1.2.3`, push the tag.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `NuGet/login` 403 | Missing `id-token: write` | Add it to the job's permissions |
| "no matching policy" | Workflow file name, owner, repo or environment differs from the policy | Compare exactly |
| Push unauthorized | Package owned by a different account than the policy | Check package owners on nuget.org |
| Key expired | Login step ran over an hour before push | Move login next to push |
| Policy turned inactive | Private repo, no publish within 7 days | Restart the window, publish |
| `already exists` | Same version pushed again | `--skip-duplicate`, or bump the version |
| `gh run rerun` uses old YAML | Re-runs replay the tagged commit's workflow | Fix the obstacle and re-run, or release a new version; don't move the tag |

If a blocker persists after one fix attempt on auth or infrastructure, stop and ask the user rather than looping.
