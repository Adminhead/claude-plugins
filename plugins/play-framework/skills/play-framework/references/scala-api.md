# Play Scala API

Package `play.api.mvc`. Based on the Play 3.0 Scala documentation.

## Controller

```scala
@Singleton
class ClientController @Inject() (
    cc: ControllerComponents,
    service: ClientService
)(implicit ec: BlockingExecutionContext)
    extends AbstractController(cc) {

  def show(id: Long): Action[AnyContent] = Action.async { implicit request =>
    Future(service.find(id))(ec).map {
      case Some(c) => Ok(Json.toJson(c))
      case None    => NotFound
    }
  }
}
```

- Use `Action.async` when the body returns a `Future`. A plain `Action { }` that waits (`Await.result`) blocks a request thread; don't.
- `Action(parse.json) { request => request.body.validate[Client] ... }` parses and validates JSON; return `BadRequest(JsError.toJson(errors))` on failure.
- Get the execution context from DI. Don't import `scala.concurrent.ExecutionContext.Implicits.global`.

## Blocking work

```scala
class BlockingExecutionContext @Inject() (system: ActorSystem)
    extends CustomExecutionContext(system, "contexts.blocking")
```

`ActorSystem` is `org.apache.pekko.actor.ActorSystem` on Play 3 and `akka.actor.ActorSystem` on 2.x. Define `contexts.blocking` in `application.conf` (see production.md for sizing).

## Routes errors: `not found: value controllers`

- Confirm the class is under `app/controllers/` with a matching `package controllers`.
- If controllers live in another package, write the full name in `conf/routes`.
- A compile error elsewhere in `app/` can leave the generated `Routes` unresolved; fix the first error, not this one.
- Subproject routes need `.dependsOn` and `routesGenerator` settings only in unusual layouts; check `build.sbt` before changing them.

## play-json

```scala
case class Client(id: Long, name: String)
object Client { implicit val format: OFormat[Client] = Json.format[Client] }
```

Scala 3: `Json.format` works for case classes without an extra import in current play-json; if macro derivation fails, write `Reads`/`Writes` by hand. `request.body.validate[T]` returns `JsResult`; never call `.get` on it.

## Compile-time DI

Use it only if the project already does: `BuiltInComponentsFromContext` with `HttpFiltersComponents`, an `ApplicationLoader` named in `play.application.loader`, and controllers constructed by hand. Don't mix it with `@Inject` controllers.

## Twirl

`@(title: String)(implicit request: RequestHeader)` and `views.html.index("x")`. Use `@routes.ClientController.show(id)` for URLs and `@helper.CSRF.formField` inside forms.

## WSClient

`ws.url(u).withRequestTimeout(5.seconds).get()` returns `Future[WSResponse]`; always set a timeout. Needs the `ws` dependency.
