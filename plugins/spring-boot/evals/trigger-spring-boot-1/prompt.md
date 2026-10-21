---
name: trigger-spring-boot-1
description: A bean-wiring failure after a package move should load the spring-boot skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I need this fixed, the app won't start since I moved the gateway classes into `com.acme.billing.gateway`:

```
Parameter 0 of constructor in com.acme.checkout.CheckoutService required a bean of type 'com.acme.billing.gateway.PaymentGateway' that could not be found.
```

```java
package com.acme.checkout;

@SpringBootApplication
public class ShopApplication {
  public static void main(String[] args) { SpringApplication.run(ShopApplication.class, args); }
}
```

```java
package com.acme.billing.gateway;

@Service
class StripeGateway implements PaymentGateway { /* ... */ }
```

The sources are in `src/main/java`. Please work out the cause and give me the change.
