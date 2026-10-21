#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/main/java/com/acme/shop src/main/resources
cat > pom.xml <<'XML'
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>4.1.1</version>
  </parent>
  <groupId>com.acme</groupId>
  <artifactId>shop</artifactId>
  <version>1.0.0</version>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-webmvc</artifactId>
    </dependency>
  </dependencies>
</project>
XML
cat > src/main/java/com/acme/shop/ShopApplication.java <<'JAVA'
package com.acme.shop;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ShopApplication {
  public static void main(String[] args) {
    SpringApplication.run(ShopApplication.class, args);
  }
}
JAVA
cat > src/main/java/com/acme/shop/PaymentService.java <<'JAVA'
package com.acme.shop;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class PaymentService {

  @Value("${app.payments.base-url}")
  private String baseUrl;

  @Value("${app.payments.timeout:5}")
  private int timeoutSeconds;

  @Value("${app.payments.max-retries:3}")
  private int maxRetries;

  public String describe() {
    return baseUrl + " timeout=" + Duration.ofSeconds(timeoutSeconds) + " retries=" + maxRetries;
  }
}
JAVA
cat > src/main/resources/application.yml <<'YML'
app:
  payments:
    base-url: https://pay.example.com
    timeout: 5
    max-retries: 3
YML
