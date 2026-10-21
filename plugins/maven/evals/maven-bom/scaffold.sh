#!/usr/bin/env bash
set -euo pipefail

# A three-module Maven project. Each child pins jackson-databind 2.17.2 itself.
mkdir -p app-core app-api app-web

cat > pom.xml <<'X'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.acme</groupId>
  <artifactId>shop</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <packaging>pom</packaging>
  <properties>
    <maven.compiler.release>17</maven.compiler.release>
  </properties>
  <modules>
    <module>app-core</module>
    <module>app-api</module>
    <module>app-web</module>
  </modules>
</project>
X

for m in app-core app-api app-web; do
cat > "$m/pom.xml" <<X
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>com.acme</groupId>
    <artifactId>shop</artifactId>
    <version>1.0.0-SNAPSHOT</version>
  </parent>
  <artifactId>$m</artifactId>
  <dependencies>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
      <version>2.17.2</version>
    </dependency>
  </dependencies>
</project>
X
done
