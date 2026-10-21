---
type: llm
weight: 2
---
Rule from the skill: upgrade one LTS at a time (11 to 17 to 21), record a green baseline first, run the build and tests after each step (`./mvnw verify` or `./gradlew build`), update the build (compiler plugin, surefire) before adopting language features, and handle known removals and behavior changes (strong encapsulation of JDK internals, dynamic agent warnings, default UTF-8 charset).

PASS only if ALL of these hold in the final answer:
1. It describes an intermediate step at Java 17 before 21, not a single jump.
2. It says to run a build or test command (such as `mvn verify`) after each step, and to get a green baseline before starting.
3. It names at least two concrete removal or behavior-change checks (for example illegal reflective access / `--add-opens`, the UTF-8 default charset, dynamic agent loading, `jdeps`/`jdeprscan`) or concrete build-plugin updates.
FAIL otherwise. Do not reward length.
