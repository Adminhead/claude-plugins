# Java to Kotlin conversion

Read for any request to convert `.java` files. Condensed from JetBrains' java-to-kotlin methodology. For Java-only edits use `java`.

## Procedure

1. Scan the imports and read the framework notes that apply: Spring and Hibernate/JPA ([spring-jpa.md](spring-jpa.md)), Lombok, Jackson, Dagger/Hilt, JUnit, Mockito, Retrofit. Interop details are in [java-interop.md](java-interop.md).
2. Convert in four passes, checking the invariants after each; on a violation, return to the previous pass:
   1. Faithful 1:1 translation. Implicitly open Java classes become `open class`; constructor-injected fields become primary-constructor properties; Javadoc becomes KDoc.
   2. Nullability and mutability. A type is non-null only when the Java proves it (`Objects.requireNonNull`, a constructor check, `@NonNull`); otherwise it stays nullable. `val` for anything never reassigned.
   3. Collections. Java `List` is `MutableList` unless the code wraps it read-only (`Collections.unmodifiableList`, `List.of`), then `List`.
   4. Idioms. Properties for getter and setter pairs, string templates, lambdas, `when`, scope functions where they simplify, top-level functions for static helpers with no class state.
3. Invariants for every pass:
   - no new side effects or behavior;
   - annotations and their targets are preserved (`@field:`, `@get:`, `@param:`);
   - package and imports preserved, except imports that shadow Kotlin names (`java.util.List`);
   - Javadoc carried forward;
   - the output is valid Kotlin.
4. Keep git history: `git mv Foo.java Foo.kt` and commit the rename, then write the Kotlin content and commit again. In a project without git, write the `.kt` and delete the `.java`. Ask before committing.
5. Several files: convert leaf dependencies first, one file at a time, updating Java callers' imports when a class moves, and report progress.
6. Compile and run the existing tests with the project's build. Done when the module builds, the tests pass, and no platform types (`Foo!`) remain in the converted signatures.

## Traps the compiler will not flag

- Platform types left in inferred `val`s.
- Mutable `var` and `MutableList` surviving where nothing mutates them.
- `static` constants turned into `val` in a companion instead of `const val`.
- Checked exceptions that Java callers still catch: add `@Throws`.
- A Java class that was subclassed or proxied (Spring, Hibernate, Mockito) must stay `open`, or use the all-open plugin.
- Lombok: delete the annotations and express them in Kotlin (`data class`, properties, `@Builder` as named and default arguments); a Lombok-generated getter that Java still calls keeps its name through the property.
- Overloaded SAM parameters (`submit(Runnable)` and `submit(Callable)`) need the explicit constructor.
