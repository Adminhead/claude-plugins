# javax to jakarta

Run this migration only when the user asks for it (a move to Tomcat 10+, Jakarta EE 9+, or a framework that requires it). Seeing `javax.*` imports alone is a reason to report, not to migrate. If the project is Spring Boot, the Boot version decides the Jakarta EE level (Boot 3 is EE 10, Boot 4 is EE 11); let the BOM manage versions and do not pin API jars.

## Procedure

1. **Baseline.** Build and test first; do not migrate on a red build. Do the migration in its own commit.
2. **Scan** for `javax.*` imports and for non-Java references: `persistence.xml`, `web.xml`, `beans.xml`, `META-INF/services/*`, properties and YAML, string class names and reflection.
3. **Rename packages** for the Jakarta EE specifications only:

   | javax package | jakarta package |
   | --- | --- |
   | `javax.servlet` | `jakarta.servlet` |
   | `javax.persistence` | `jakarta.persistence` |
   | `javax.validation` | `jakarta.validation` |
   | `javax.annotation` (`@PostConstruct`, `@Resource`) | `jakarta.annotation` |
   | `javax.inject`, `javax.enterprise` | `jakarta.inject`, `jakarta.enterprise` |
   | `javax.ws.rs` | `jakarta.ws.rs` |
   | `javax.el`, `javax.json`, `javax.mail`, `javax.websocket`, `javax.faces`, `javax.transaction` | the `jakarta.` equivalent |

4. **Leave JDK packages alone.** `javax.sql`, `javax.naming`, `javax.crypto`, `javax.net`, `javax.security.auth`, `javax.swing`, `javax.xml.parsers`, `javax.xml.transform` ship with the JDK and keep their names. A global find-and-replace on `javax.` breaks the build.
5. **Dependencies.** Replace coordinates (`javax.servlet:javax.servlet-api` becomes `jakarta.servlet:jakarta.servlet-api`) and move every library that touches these APIs to its Jakarta release: Hibernate 6+, Jersey 3+, Tomcat 10+, Jackson `jakarta.rs` modules, Hibernate Validator 7+, and so on. A single leftover `javax` library fails at runtime with `NoClassDefFoundError` or `ClassNotFoundException`.
6. **Descriptors.** `web.xml` moves to the namespace `https://jakarta.ee/xml/ns/jakartaee` and the version matching the target servlet level. `persistence.xml` properties named `javax.persistence.*` become `jakarta.persistence.*` (Hibernate 6 reads both for some, not all).
7. **Verify.** Compile, run all tests, then `grep -rn "javax\." src` and confirm only JDK packages remain. Check the dependency tree for old `javax.*` jars (`mvn dependency:tree | grep javax`, `gradle dependencies`).

## Mechanical help

- OpenRewrite recipe `org.openrewrite.java.migrate.jakarta.JavaxMigrationToJakarta` handles imports, descriptors and dependency coordinates; review the diff.
- Eclipse Transformer rewrites binaries when a third-party jar has no Jakarta release.
- Tomcat provides a migration tool for deployed web apps.

## Report

List files changed, packages renamed, dependencies bumped, anything left on `javax` and why, and manual steps remaining.
