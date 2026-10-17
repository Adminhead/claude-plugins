---
name: godot-vs-unity
description: "A Unity C# MonoBehaviour question does not load the godot skill."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Unity project, this PlayerController jitters when the camera follows it. Should the movement be in Update or FixedUpdate?

```csharp
public class PlayerController : MonoBehaviour
{
    public float speed = 5f;
    Rigidbody rb;
    void Start() { rb = GetComponent<Rigidbody>(); }
    void Update()
    {
        var input = new Vector3(Input.GetAxis("Horizontal"), 0, Input.GetAxis("Vertical"));
        rb.MovePosition(rb.position + input * speed * Time.deltaTime);
    }
}
```
