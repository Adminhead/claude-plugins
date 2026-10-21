#!/usr/bin/env bash
set -euo pipefail
# Seed a tiny Spring Boot 4 project: one controller, one service, no tests.
mkdir -p src/main/java/com/acme/orders src/test/java/com/acme/orders
cat > pom.xml <<'P'
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>4.0.8</version>
  </parent>
  <groupId>com.acme</groupId>
  <artifactId>orders</artifactId>
  <version>1.0.0</version>
  <properties>
    <java.version>21</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-webmvc</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-webmvc-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
P
cat > src/main/java/com/acme/orders/OrdersApplication.java <<'J'
package com.acme.orders;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class OrdersApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrdersApplication.class, args);
    }
}
J
cat > src/main/java/com/acme/orders/Order.java <<'J'
package com.acme.orders;

public record Order(long id, String status) {}
J
cat > src/main/java/com/acme/orders/OrderNotFoundException.java <<'J'
package com.acme.orders;

public class OrderNotFoundException extends RuntimeException {
    public OrderNotFoundException(long id) {
        super("Order " + id + " not found");
    }
}
J
cat > src/main/java/com/acme/orders/OrderService.java <<'J'
package com.acme.orders;

import org.springframework.stereotype.Service;

@Service
public class OrderService {
    public Order findById(long id) {
        throw new UnsupportedOperationException("backed by a database in production");
    }
}
J
cat > src/main/java/com/acme/orders/OrderController.java <<'J'
package com.acme.orders;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/orders/{id}")
    public Order get(@PathVariable long id) {
        return orderService.findById(id);
    }

    @ExceptionHandler(OrderNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    void notFound() {}
}
J
