# Node.js and NestJS (server)

Snippets here are fragments, not complete programs.

```
npm i @openfeature/server-sdk @openfeature/go-feature-flag-provider
```
```ts
import { OpenFeature } from "@openfeature/server-sdk";
import { GoFeatureFlagProvider, EvaluationType } from "@openfeature/go-feature-flag-provider";

const provider = new GoFeatureFlagProvider({
  endpoint: 'http://localhost:1031/',
  evaluationType: EvaluationType.InProcess,   // or Remote
  flagChangePollingIntervalMs: 30000,
});
await OpenFeature.setProviderAndWait(provider);   // setProvider(...) does not wait for readiness
const client = OpenFeature.getClient('my-app');
const v = await client.getBooleanValue('flag-only-for-admin', false, { targetingKey: 'u-1', admin: true });
client.track('user_action', context, { action: 'button_click' });
```
Options (default): `endpoint` (required), `evaluationType` (`InProcess`), `timeout` (10000), `flagChangePollingIntervalMs` (120000), `dataFlushInterval` (120000), `maxPendingEvents` (10000), `disableDataCollection` (false), `apiKey`, `exporterMetadata` (`new ExporterMetadata().add(k, v)`), `fetchImplementation`.

Accessors: `getBooleanValue`, `getStringValue`, `getNumberValue`, `getObjectValue`, plus `*Details`.

Next.js: in-process loads a WASM binary; set `serverExternalPackages: ["@openfeature/go-feature-flag-provider"]` in `next.config.ts`. Vercel Flags SDK adapter:
```ts
createOpenFeatureAdapter(async () => {
  await OpenFeature.setProviderAndWait(new GoFeatureFlagProvider({ endpoint }));
  return OpenFeature.getClient();
})
```

## NestJS

```
@openfeature/nestjs-sdk + the node provider
```
```ts
const goffProvider = new GoFeatureFlagProvider({ endpoint: 'http://localhost:1031/' });
@Module({ imports: [ OpenFeatureModule.forRoot({ contextFactory: () => ({ targetingKey: 'nestjs-test' }) }) ] })
export class AppModule implements OnModuleInit {
  async onModuleInit() { await OpenFeature.setProviderAndWait(goffProvider); }
}
// service: constructor(@OpenFeatureClient() private ofClient: Client) {}
//          await this.ofClient.getBooleanValue('test-flag', false, { targetingKey: '...' });
```
Use a real per-request id in `contextFactory`, not a constant, so percentage rollouts distribute.
