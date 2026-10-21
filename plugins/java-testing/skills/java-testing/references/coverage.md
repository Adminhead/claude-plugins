# Coverage with JaCoCo

Use coverage to find untested branches in code you are changing. Don't set a percentage target, and don't write tests that execute code without asserting behavior.

## Maven

```xml
<plugin>
  <groupId>org.jacoco</groupId>
  <artifactId>jacoco-maven-plugin</artifactId>
  <version>${jacoco.version}</version>   <!-- pin in pluginManagement; use a release that supports your JDK -->
  <executions>
    <execution><goals><goal>prepare-agent</goal></goals></execution>
    <execution><id>report</id><phase>test</phase><goals><goal>report</goal></goals></execution>
  </executions>
</plugin>
```

Run `./mvnw clean test` and open `target/site/jacoco/index.html`. `prepare-agent` sets the `argLine` property; if Surefire has its own `<argLine>`, it must include `@{argLine}` or JaCoCo records nothing (empty report, 0%).

## Gradle

`plugins { jacoco }`, then `./gradlew test jacocoTestReport` and read `build/reports/jacoco/test/html/index.html`. Make the report depend on `test` with `tasks.test { finalizedBy(tasks.jacocoTestReport) }`.

## Reading it

- Look at missed branches (red and yellow diamonds) in the classes you changed, not the project total.
- Skip generated code, records' accessors, and trivial getters.
- Integration tests under Failsafe need `prepare-agent-integration` and `report-integration` to be counted.
- Java 21+ with the Mockito agent: both `-javaagent` flags must be in the same `argLine`.
- A legacy `check` rule that enforces a minimum is the project's choice; leave it alone, but don't add a new one unasked.
