# Forms and validation

## Which form mechanism

| Where the form renders | Mechanism |
|---|---|
| Static SSR (mode None, or a per-page app's page without `@rendermode`) | `EditForm` with `FormName` + `[SupplyParameterFromForm]`; posts as HTML. No `@bind`, `@oninput` or `@onchange` |
| Interactive Server | `EditForm` with `@bind-Value`; live validation and dynamic UI |
| WebAssembly / Auto | As Server, but validation that needs server data calls an API |

## One EditForm pattern for both SSR and interactive

```razor
<EditForm Model="Employee" OnValidSubmit="HandleSubmit" FormName="employee">
    <DataAnnotationsValidator />
    <ValidationSummary />
    <label>
        Name: <InputText @bind-Value="Employee!.Name" />
        <ValidationMessage For="() => Employee!.Name" />
    </label>
    <button type="submit" disabled="@isSubmitting">@(isSubmitting ? "Saving..." : "Save")</button>
</EditForm>

@code {
    [SupplyParameterFromForm]
    private EmployeeModel? Employee { get; set; }
    private bool isSubmitting;

    protected override void OnInitialized() => Employee ??= new();

    private async Task HandleSubmit()
    {
        isSubmitting = true;
        try { await Employees.SaveAsync(Employee!); }
        finally { isSubmitting = false; }
    }
}
```

In SSR, `FormName` identifies the posted form, `[SupplyParameterFromForm]` binds the POST, and `??=` creates the model on GET while keeping posted values on POST. In interactive mode `[SupplyParameterFromForm]` is ignored and `FormName` is harmless.

- `EditForm` takes `Model` **or** `EditContext`, never both. Use `EditContext` for programmatic field tracking, dynamic rules or manual `Validate()`.
- `OnValidSubmit`/`OnInvalidSubmit` run after validation; `OnSubmit` means you validate yourself, and it can't be combined with the other two.
- Without `<DataAnnotationsValidator />`, annotation attributes are silently ignored.

## Inputs

| Component | Binds |
|---|---|
| `InputText`, `InputTextArea` | `string` |
| `InputNumber<T>` | `int`, `long`, `decimal`, `double`... |
| `InputDate<T>` | `DateTime`, `DateTimeOffset`, `DateOnly`, `TimeOnly` |
| `InputCheckbox` | `bool` |
| `InputSelect<T>` | `string`, enums, numbers |
| `InputRadioGroup<T>` + `InputRadio<T>` | `string`, enums, numbers |
| `InputFile` | `IBrowserFile` (interactive modes only) |

Wrap inputs in `<label>` or pair `id`/`for`. Enum options: `@foreach (var v in Enum.GetValues<OrderStatus>()) { <option value="@v">@v</option> }`.

## Validation

- Data annotations on the model (`[Required]`, `[StringLength]`, `[Range]`, `[EmailAddress]`), shown with `<ValidationSummary />` and `<ValidationMessage For="() => Model!.Field" />`.
- Server-side or cross-field rules: a small validator component that takes the cascading `EditContext`, owns a `ValidationMessageStore`, clears it on `OnValidationRequested` and `OnFieldChanged`, adds messages with `store.Add(EditContext.Field(name), message)`, then calls `EditContext.NotifyValidationStateChanged()`. Call it from the submit handler with the errors the service returned.
- Custom CSS classes (Bootstrap `is-valid`/`is-invalid`): subclass `FieldCssClassProvider` and call `editContext.SetFieldCssClassProvider(...)`.

## Reacting to input (interactive only)

- `@bind-Value="Model!.ZipCode" @bind:after="OnZipChanged"` runs async logic after the value is set.
- `@bind:event="oninput"` (or `@oninput`) for search-as-you-type; debounce with a CTS + `Task.Delay` ([components.md](components.md)).

## SSR specifics

- Several forms on one page: each needs a unique `FormName`, and `[SupplyParameterFromForm(FormName = "search")]` ties a property to its form. Without distinct names, both handlers see every post.
- `Enhance` on `EditForm` (or `data-enhance` on a `<form>`) submits with fetch and patches the DOM instead of a full reload.
- A plain `<form method="post" @formname="raw" @onsubmit="Submit">` needs `<AntiforgeryToken />` inside; `EditForm` adds it. The app needs `app.UseAntiforgery()`.

## File upload

`InputFile` needs an interactive render mode.

```razor
<InputFile OnChange="OnFilesSelected" accept=".pdf,.png" multiple />

@code {
    private const long MaxBytes = 10 * 1024 * 1024;

    private async Task OnFilesSelected(InputFileChangeEventArgs e)
    {
        foreach (var file in e.GetMultipleFiles(maximumFileCount: 5))
        {
            await using var stream = file.OpenReadStream(maxAllowedSize: MaxBytes);
            await Storage.SaveAsync(Path.GetRandomFileName(), stream);
        }
    }
}
```

- `OpenReadStream` defaults to a 500 KB limit and throws past `maxAllowedSize`; set it deliberately. `GetMultipleFiles` throws above its count limit (default 10).
- Treat `file.Name` and `ContentType` as untrusted: generate the stored name, check type by content, and scan if the files are served back.
- On Server the bytes stream over the circuit; on WebAssembly they're read in the browser and then sent to your API.
