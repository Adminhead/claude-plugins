---
name: trigger-spring-boot-testing-1
description: A slice test that fails to load a controller dependency should load the spring-boot-testing skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My new controller test blows up before any test method runs and I can't see why:

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @Autowired MockMvc mockMvc;

    @Test
    void returnsOrder() throws Exception {
        mockMvc.perform(get("/orders/1")).andExpect(status().isOk());
    }
}
```

```
UnsatisfiedDependencyException: Error creating bean with name 'orderController':
Unsatisfied dependency expressed through constructor parameter 0:
No qualifying bean of type 'com.acme.orders.OrderService' available
```

OrderController takes an OrderService in its constructor, and OrderService is a normal @Service. Everything works when I run the app. What do I change?
