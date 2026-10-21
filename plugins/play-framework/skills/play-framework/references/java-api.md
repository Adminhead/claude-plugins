# Play Java API

Package `play.mvc`. Based on the Play 3.0 Java documentation; check the matching version's docs when an API looks missing.

## Controller

```java
public class ClientController extends Controller {
  private final ClientService service;
  private final BlockingExecutionContext blocking;

  @Inject
  public ClientController(ClientService service, BlockingExecutionContext blocking) {
    this.service = service;
    this.blocking = blocking;
  }

  public CompletionStage<Result> show(Http.Request request, Long id) {
    return CompletableFuture.supplyAsync(() -> service.find(id), blocking)
        .thenApply(c -> c.map(v -> ok(Json.toJson(v))).orElseGet(() -> notFound()));
  }
}
```

- Take `Http.Request request` as a method parameter and declare it in the route with the type `Request`; the router fills it in and its position among the other parameters does not matter: `GET /clients/:id controllers.ClientController.show(request: Request, id: Long)`. Don't use the removed static `request()`.
- Return `ok()`, `created()`, `badRequest()`, `notFound()`, `redirect(routes.ClientController.show(id))`.
- Use `import javax.inject.Inject` or `jakarta.inject.Inject` to match the code already in the repo.

## Blocking work: custom executor

```java
public class BlockingExecutionContext extends CustomExecutionContext {
  @Inject
  public BlockingExecutionContext(ActorSystem actorSystem) {
    super(actorSystem, "contexts.blocking");
  }
}
```

On Play 3, `ActorSystem` is `org.apache.pekko.actor.ActorSystem`; on 2.x it is `akka.actor.ActorSystem`.

```hocon
contexts.blocking {
  fork-join-executor {
    parallelism-factor = 2.0
    parallelism-max = 32
  }
}
```

Size it to the connection pool, not to request volume. Pass the context to `supplyAsync`, `thenApplyAsync` and `thenComposeAsync`.

## JSON

- Out: `Json.toJson(obj)` (Jackson `ObjectMapper` under the hood), then `ok(node)`.
- In: `@BodyParser.Of(BodyParser.Json.class)` and `request.body().asJson()`, then `Json.fromJson(node, Client.class)`. A null body means a wrong content type; return `badRequest`.
- Use `Jackson`/`ObjectMapper` configuration through `play.modules`/binding if mapper settings must change; don't create a second static mapper.

## Forms

```java
Form<ClientForm> form = formFactory.form(ClientForm.class).bindFromRequest(request);
if (form.hasErrors()) return badRequest(views.html.client.render(form, request));
```

Constraint annotations (`@Constraints.Required`) are on the form class. Inject `FormFactory`. Pass the `Http.Request` to templates that render CSRF tokens or messages.

## WSClient

Inject `WSClient`. `ws.url(u).setRequestTimeout(Duration.ofSeconds(5)).get()` returns `CompletionStage<WSResponse>`. Always set a timeout. Use `thenApply(r -> r.asJson())`. The build needs the `ws` dependency.

## Twirl from Java

`views.html.index.render("title")` returns `Html`; `ok(views.html.index.render(...))`. Templates take `Http.Request` as an implicit-like parameter: declare `@(msg: String)(implicit request: Http.Request)` in the template when it calls CSRF or flash helpers.

## DI

Guice is the default (`guice` in `libraryDependencies`). Bind interfaces with `@ImplementedBy` or a `Module` listed in `play.modules.enabled`. Use `@Singleton` for stateful services and `Provider<T>` to break cycles.

## Filters and actions

- Custom action composition: extend `play.mvc.Action.Simple`, override `call(Http.Request)`, and annotate controllers with `@With(MyAction.class)`.
- Per-route CSRF: `@AddCSRFToken` on the action that renders a form, `@RequireCSRFCheck` on the one that handles it (only when `play.filters.csrf` is not enabled globally).
