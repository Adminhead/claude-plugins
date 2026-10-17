---
name: esp-panic-routing
description: An ESP32 crash with a backtrace routes to esp-idf, not generic problem-solving.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

My board reboots every few minutes once the sensor task starts. The serial output just before each reboot looks like this:

```
Core  1 panic'ed (LoadProhibited). Exception was unhandled.
EXCVADDR: 0x00000000
Backtrace: 0x400d2f1a:0x3ffb5e60 0x400d31b4:0x3ffb5e90 0x40089e2d:0x3ffb5ec0
rst:0xc (SW_CPU_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)
```

What's going on and how do I find the line that's crashing?
