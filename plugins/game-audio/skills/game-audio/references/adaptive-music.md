# Adaptive music

Music that changes with play instead of looping one track. Two techniques, often combined. Engine-neutral pseudocode; the engine skill or middleware supplies the players (Godot has interactive and synchronized stream types; see the `godot` skill's `audio.md`).

## Contents

1. Vertical layering
2. Horizontal re-sequencing
3. Transition strategies
4. Mapping gameplay to intensity
5. Authoring and budget notes

## 1. Vertical layering (re-orchestration)

Several stems (drums, bass, melody, tension pad) of identical length and tempo start together and stay sample-aligned; only their volumes change.

```text
start_layers():
    for p in layers: p.volume_db = -80; p.play()     # start all at once, silent
    layers.base.volume_db = 0

set_intensity(level):                                 # 0 calm, 1 alert, 2 combat
    fade(layers.drums,   0 if level >= 1 else -80, 0.8 s)
    fade(layers.tension, 0 if level >= 2 else -80, 0.8 s)
```

- Fades of 0.5 to 1.5 s sound musical; instant cuts sound mechanical.
- Because layers never restart, intensity can change at any moment without losing sync.
- Use the engine's synchronized-stream feature when it has one, so stems can't drift.

## 2. Horizontal re-sequencing

The score is split into segments (intro, explore A, explore B, combat, victory, outro). A request to change section is queued and applied at the next safe musical boundary.

```text
sec_per_bar = 60 / bpm * beats_per_bar
request_section(name): pending = name                 # never switch mid-bar
on_bar_boundary():
    if pending: crossfade_to(pending, 0.2 s); pending = none
```

Pick the boundary by section length: beat for fast reactive cues, bar for most changes, phrase (4 or 8 bars) for big mood shifts.

## 3. Transition strategies

Roughly in order of polish:

| Strategy | How | Use for |
|---|---|---|
| Immediate crossfade | Blend volumes over 0.2 to 2 s | Low-stakes changes, menus |
| Quantised switch | Wait for the next beat, bar or phrase, then switch | Default for music that should stay in time |
| Transition segment | A short bridge written to connect A to B | Signature moments (combat start, boss) |
| Stinger | A one-shot accent over the bed | Events that shouldn't change the loop (secret found, level up) |
| Resume at position | Return to where a segment left off instead of restarting | Exploration music after a short combat |

## 4. Mapping gameplay to intensity

Drive music from one smoothed 0..1 value, not raw events, and use hysteresis so it doesn't flap at a threshold.

```text
raw = clamp(enemies_near / 5, 0, 1) * (1 - 0.4 * player_hp01)
intensity = lerp(intensity, raw, 1 - exp(-k * dt))    # frame-rate independent smoothing

level_from(i, current):
    if current == 0 and i > 0.6: return 1
    if current == 1 and i < 0.4: return 0
    return current
```

- Add a minimum dwell time per level (for example 8 bars) so short skirmishes don't bounce the score.
- Expose the intensity value in a debug overlay while tuning.

## 5. Authoring and budget notes

- Author stems and segments at one tempo and bounce them aligned. Loop points must be sample-accurate and on bar boundaries; test the wrap point for clicks.
- Store BPM, beats per bar and segment boundaries as data next to the music, not as constants in code.
- Stream long music and decode SFX into memory. Many simultaneous stems cost voices and memory; keep stem counts modest on low-end and mobile targets.
- Reach for middleware (FMOD, Wwise) once the music system grows past a handful of stems and segments; it implements layering, quantised transitions and parameter-driven intensity natively.
