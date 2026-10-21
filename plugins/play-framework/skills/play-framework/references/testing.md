# Testing Play apps

## Scala: scalatestplus-play

Use the release matching the Play line (6.x for Play 2.9, 7.x for 3.0; confirm on Maven Central).

```scala
libraryDependencies += "org.scalatestplus.play" %% "scalatestplus-play" % "<match Play line>" % Test
```

- Controller unit test: `class ClientControllerSpec extends PlaySpec with GuiceOneAppPerSuite`, then `val result = route(app, FakeRequest(GET, "/clients/1")).get`, and assert with `status(result) mustBe OK`, `contentAsJson(result)`.
- Without an app: construct the controller with `Helpers.stubControllerComponents()` and call `controller.show(1).apply(FakeRequest())`.
- Override a binding: `new GuiceApplicationBuilder().overrides(bind[ClientService].toInstance(stub)).build()`.

## Java: play.test

```java
public class ClientControllerTest extends WithApplication {
  @Override
  protected Application provideApplication() {
    return new GuiceApplicationBuilder()
        .overrides(bind(ClientService.class).toInstance(new FakeClientService()))
        .build();
  }

  @Test
  public void showReturnsClient() {
    Http.RequestBuilder req = Helpers.fakeRequest(GET, "/clients/1");
    Result result = route(app, req);
    assertEquals(OK, result.status());
  }
}
```

Static imports from `play.test.Helpers`. JUnit and the `play-test` artifact come with the Play sbt plugin's `Test` configuration; use `sbt "testOnly controllers.ClientControllerTest"`.

## Rules

- Stub services at the boundary (DB, WS); don't bind the real WSClient to the internet. `WSTestClient` or `play.test.WSTestClient` plus a `Server` is for true integration tests.
- CSRF is on by default in app tests that post forms. Add the token (`CSRFTokenHelper.addCSRFToken`) or use `Helpers.fakeRequest().header("Csrf-Token", "nocheck")`.
- Database tests: use an in-memory database with evolutions applied, or Testcontainers; don't point tests at a developer database.
- One command per failure: `sbt "testOnly <class> -- -z \"substring\""` for ScalaTest, `testOnly <class>` for JUnit.
