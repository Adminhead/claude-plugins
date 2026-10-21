#!/usr/bin/env bash
set -euo pipefail
# Seed a tiny Maven project: one class that reads the wall clock.
mkdir -p src/main/java/shop src/test/java/shop
cat > pom.xml <<'P'
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>shop</groupId>
  <artifactId>pricing</artifactId>
  <version>1.0.0</version>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.11.4</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
P
cat > src/main/java/shop/PriceCalculator.java <<'J'
package shop;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;

/** Total price after a quantity discount; weekends get an extra 5% off. */
public class PriceCalculator {

    public BigDecimal total(BigDecimal unitPrice, int quantity) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("quantity must be positive");
        }
        BigDecimal rate = BigDecimal.ONE;
        if (quantity >= 100) {
            rate = rate.subtract(new BigDecimal("0.15"));
        } else if (quantity >= 10) {
            rate = rate.subtract(new BigDecimal("0.05"));
        }
        DayOfWeek today = LocalDate.now().getDayOfWeek();
        if (today == DayOfWeek.SATURDAY || today == DayOfWeek.SUNDAY) {
            rate = rate.subtract(new BigDecimal("0.05"));
        }
        return unitPrice.multiply(BigDecimal.valueOf(quantity)).multiply(rate);
    }
}
J
