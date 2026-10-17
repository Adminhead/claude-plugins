# Publishing and deploying

Aspire deployment is pipeline-based and driven by the AppHost: you add a **compute environment** resource for the target, and compatible compute resources (projects, containers, executables with Dockerfiles) attach to it. `aspire publish`, `aspire deploy` and `aspire do` are preview commands; check `aspire deploy --help` and the target's page on aspire.dev for the installed version.

## Targets

| Target | Hosting package | AppHost call | publish | deploy |
|---|---|---|---|---|
| Docker Compose | `Aspire.Hosting.Docker` | `builder.AddDockerComposeEnvironment("compose")` | yes | yes |
| Kubernetes (Helm) | `Aspire.Hosting.Kubernetes` | `builder.AddKubernetesEnvironment("k8s")` | yes | yes |
| Azure Kubernetes Service | `Aspire.Hosting.Azure.Kubernetes` | `builder.AddAzureKubernetesEnvironment("aks")` | yes | yes |
| Azure Container Apps | `Aspire.Hosting.Azure.AppContainers` | `builder.AddAzureContainerAppEnvironment("env")` | yes | yes |
| Azure App Service | `Aspire.Hosting.Azure.AppService` | `builder.AddAzureAppServiceEnvironment("env")` | yes | yes |

Add the package with `aspire add <name>` (a partial name such as `docker` or `kubernetes` searches NuGet and lists matches). With more than one environment, bind each resource explicitly with `.WithComputeEnvironment(env)`.

## Commands

- `aspire publish --environment staging`: writes the target's artifacts to `aspire-output/` (for Compose: `docker-compose.yaml` plus a `.env` listing the parameters to fill; for Kubernetes: a Helm chart; for Azure: Bicep). Parameters stay unresolved, so this is the handoff to your own CI/CD or GitOps tooling.
- `aspire deploy --environment production`: generates, resolves parameters (prompting or reading configuration), builds and pushes images, and applies the change. It doesn't consume earlier `publish` output.
- `aspire do <step>`: one pipeline step plus its dependencies, for example `aspire do publish`.
- `aspire destroy`: tears down what `aspire deploy` created.

Run `aspire deploy` and `aspire destroy` only with the user's go-ahead; both change real infrastructure. Azure targets use Azure CLI credentials by default (`az login` first).

## Kubernetes specifics

```csharp
var k8s = builder.AddKubernetesEnvironment("k8s")
    .WithHelm(helm =>
    {
        helm.Namespace = builder.AddParameter("helmNamespace");
        helm.ReleaseName = builder.AddParameter("helmRelease");
    });
builder.AddContainerRegistry("registry", builder.AddParameter("registryEndpoint"));

var api = builder.AddProject<Projects.Api>("api");
var web = builder.AddProject<Projects.Web>("web").WithReference(api);

k8s.AddIngress("ingress")
    .WithDefaultBackend(web.GetEndpoint("http"))
    .WithHostname(builder.AddParameter("externalFqdn"))
    .WithTls();
```

`k8s.AddHelmChart("cert-manager", "oci://quay.io/jetstack/charts/cert-manager", "<version>")` installs third-party charts alongside. Review the generated chart with the `helm` and `kubernetes` skills before applying it to a shared cluster.

## Environment-specific behavior

- `builder.ExecutionContext.IsPublishMode` / `IsRunMode` lets the AppHost differ between local runs and deployment (for example an emulator locally, a managed service in publish mode: `builder.AddAzureCosmosDB("cosmos").RunAsEmulator()` only in run mode).
- Secrets come from `AddParameter(..., secret: true)`; in Compose they land in `.env`, in Kubernetes in Secrets, in Azure in the platform's secret store. Never commit a filled `.env`.
- Mark only user-facing resources with `.WithExternalHttpEndpoints()`; everything else stays internal to the environment.

## CI

Install the CLI in CI as a pinned tool (`dotnet tool install -g Aspire.Cli --version <x.y.z>`) rather than piping an install script to a shell, then run `aspire publish` and hand the artifacts to the deploy job, or `aspire deploy --non-interactive` with parameters supplied as environment variables or configuration. Workflow hardening belongs to `gh-actions`.
