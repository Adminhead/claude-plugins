# Rollouts and worked examples

All examples are adapted from the GO Feature Flag docs. Run `go-feature-flag-cli lint` on any file you adapt.

## Contents

- Minimal flag, targeting by key
- Percentage, custom bucketing
- Progressive rollout, scheduled rollout, experimentation
- Metadata, disable, JSON

## Minimal flag

```yaml
display-banner:
  variations:
    enabled: true
    disabled: false
  defaultRule:
    variation: disabled
```

## Targeting by key, with a default

```yaml
scream-level-feature:
  variations:
    low: "whisper"
    medium: "talk"
    high: "scream"
  targeting:
    - query: targetingKey eq "12345"
      variation: high
    - query: targetingKey eq "678910"
      variation: medium
  defaultRule:
    variation: low
```

## Percentage

```yaml
percentage-flag-1:
  variations:
    disabled: false
    enabled: true
  targeting:
    - query: admin eq true
      percentage:
        disabled: 50
        enabled: 50
  defaultRule:
    percentage:
      disabled: 99
      enabled: 1
```

- The bucket is `hash(targetingKey + flagName) % sum(percentages)`, deterministic across servers and restarts.
- Variations are laid out in reverse alphabetical order: varC 20, varB 30, varA 50 gives 0-20 varC, 20-50 varB, 50-100 varA.
- With more than two variations, changing percentages shifts every boundary and can reassign users.

## Custom bucketing

```yaml
scream-level-feature:
  bucketingKey: "teamId"
  variations:
    low: "whisper"
    medium: "talk"
    high: "scream"
  defaultRule:
    percentage:
      medium: 50
      high: 50
```

- Nested path with dots: `bucketingKey: "company.id"`.
- The value must be a string. Few distinct values give an uneven split.

## Progressive rollout

Before `initial.date` the initial state is served, between the dates it ramps, after `end.date` the end state is served. Dates use the native date format of the file format.

```yaml
progressive-flag:
  variations:
    variationA: A
    variationB: B
  defaultRule:
    progressiveRollout:
      initial:
        variation: variationA
        date: 2024-01-01T05:00:00.100Z
      end:
        variation: variationB
        date: 2024-01-05T05:00:00.100Z
```

With a partial ramp:

```yaml
    progressiveRollout:
      initial:
        variation: variationA
        percentage: 20
        date: 2024-01-01T05:00:00.100Z
      end:
        variation: variationB
        percentage: 80
        date: 2024-01-05T05:00:00.100Z
```

The docs call the percentage semantics non-intuitive. They say `percentage` is optional (default initial 0, end 100) while the JSON schema marks it required: set it explicitly if the linter complains.

## Scheduled rollout

Each step needs a `date` and overrides any other flag field. A step without `date` is skipped, and steps do not trigger notifiers. Give a targeting rule a `name` so a step can patch it.

```yaml
scheduled-flag:
  variations:
    variationA: A
    variationB: B
  defaultRule:
    name: defaultRule
    percentage:
      variationA: 100
      variationB: 0
  scheduledRollout:
    - date: 2020-04-10T00:00:00.1+02:00
      targeting:
        - name: rule1
          query: beta eq "true"
          percentage:
            variationA: 0
            variationB: 100
    - date: 2022-05-12T15:36:00.1+02:00
      targeting:
        - name: rule1
          query: beta eq "false"
```

## Experimentation

The flag is served only between `start` and `end` (both required). Outside the window the default value is served. For A/B tests pair it with an exporter.

```yaml
experimentation-flag:
  variations:
    enabled: true
    disabled: false
  defaultRule:
    percentage:
      enabled: 50
      disabled: 50
  experimentation:
    start: 2021-03-20T00:00:00.1-05:00
    end: 2021-03-21T00:00:00.1-05:00
```

Test the window by adding `"gofeatureflag": {"currentDateTime": "2021-03-20T12:00:00Z"}` to the `evaluate --ctx` JSON.

## Metadata, names, tracking, version

```yaml
example_flag:
  variations:
    A: true
    B: false
  defaultRule:
    variation: B
  version: "1.0.0"
  trackEvents: true
  metadata:
    description: this is a super simple example feature flag
    issue-link: https://jira.xxx/GOFF-01
```

For the OpenFeature manifest, add `metadata.defaultValue` (mandatory, else the flag is excluded) and optionally `metadata.description`.

## Disable

```yaml
my-flag:
  disable: true
  variations:
    enabled: true
    disabled: false
  defaultRule:
    variation: disabled
```

A disabled flag evaluates to the SDK default with reason `DISABLED`. For a single rule, put `disable: true` inside that rule (confirm the key with `lint`; the docs table says `disabled`).

## JSON

The only JSON flag example in the docs is a MongoDB document, where `flag` holds the flag name (MongoDB retriever only). In a file the structure is the same as YAML. A TOML example is not documented (verify against docs). The relay proxy needs `fileFormat: json` or `toml`; the default is yaml.

```json
{
  "flag": "new-admin-access",
  "variations": { "default_var": false, "false_var": false, "true_var": true },
  "defaultRule": { "percentage": { "false_var": 70, "true_var": 30 } }
}
```

File form, with the flag name as the top-level key (adapted, not from the docs; run lint):

```json
{
  "my-flag": {
    "variations": { "on": true, "off": false },
    "defaultRule": { "percentage": { "on": 30, "off": 70 } }
  }
}
```
