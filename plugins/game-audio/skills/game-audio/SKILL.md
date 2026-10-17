---
name: game-audio
description: Plans and reviews game audio practice, covering bus and mixer layout, gain in dB, ducking, adaptive music (layers, stems, transitions), SFX variation and voice limits, beat sync and loudness targets. Engine-neutral. Use for "audio mix", "music transitions", "ducking", "SFX variation", "volume sliders" or "sync to the beat" in a game.
---

# Game audio

Game audio is a mixing graph plus a music system. Route every sound through a few buses so groups can be balanced and processed, and make music react to play instead of looping one track. The engine skill owns the concrete nodes and API (for Godot, the `godot` skill's `audio.md` reference); middleware such as FMOD or Wwise implements most of this natively.

Adapted from awesome-gamedev-agent-skills `disciplines/audio-design` (Apache-2.0); see LICENSE and NOTICE.

Not for: asset import and compression settings (engine skill), composing or sound-design craft, or haptics and screen feedback (`game-feel`). Use each one if installed.

## Workflow

1. **Lay out buses, not per-clip volumes.** A typical tree: `Master <- Music, SFX, Ambience, UI, Voice`, with sub-buses where a group needs its own processing (`SFX <- Weapons, Footsteps`). Every player routes to a bus. Settings sliders map to bus volumes. Done when no gameplay code sets a clip volume to balance the mix.
2. **Work in decibels.** Perceived loudness is logarithmic. Map a 0..1 slider through `linear_to_db` (and back with `db_to_linear`), and mute at the bottom of the slider instead of passing 0 (which is minus infinity dB).
3. **Leave headroom and pick a loudness target.** Keep the summed master below 0 dBFS with a true-peak ceiling around -1 dBTP, and a limiter on Master as a safety net, not as the mixer. Measure integrated loudness over a representative play session: about -24 LUFS (±2) for console and PC per Sony's ASWG-R001, which other platform holders follow, and about -18 LUFS for mobile and handheld per current PlayStation guidance. Check the platform's current delivery spec before cert.
4. **Duck competing sources.** Voice and critical cues dip music and ambience through a sidechain compressor or a volume tween, then recover. Fast attack (about 10 ms), slow release (300 to 500 ms), ratio high enough to hear (around 4:1 to 8:1).
5. **Make music adaptive.** Vertical layering (stems faded by intensity) and horizontal re-sequencing (segments switched at bar or phrase boundaries), driven by a smoothed intensity value with hysteresis. Read [references/adaptive-music.md](references/adaptive-music.md).
6. **Vary and limit repeated SFX.** Pick from a pool of 3 or more takes without immediate repeats, add small pitch (about ±5%) and volume (about ±2 dB) offsets, and cap simultaneous voices per sound (footsteps 4 to 8, a gun 3 to 6) with a steal policy (oldest or quietest). Pool or free one-shot players when they finish.
7. **Sync to the music clock.** Schedule beat-locked events from the audio playback position plus output latency, never from accumulated frame delta.
8. **Verify on real output.** Listen on headphones, TV speakers and a phone speaker; play a full session with music at default; check that ducking is audible without pumping, transitions land on the beat, and every slider covers its range smoothly. Report what you measured (loudness meter readings) and heard.

## Patterns

Engine-neutral pseudocode.

```text
# Slider (0..1) to bus volume
set_bus_volume(bus, v):
    if v <= 0.001: mute(bus); return
    unmute(bus); bus.volume_db = linear_to_db(v)
# Wrong: bus.volume_db = v   (0.5 means +0.5 dB, nearly no change)

# Ducking without a sidechain
on voice_started: tween(music_bus.volume_db -> -10 dB, 0.1 s)
on voice_ended:   tween(music_bus.volume_db -> 0 dB, 0.4 s)

# Varied one-shot with voice limit
play_varied(pool, bus, max_voices):
    if active_voices(pool) >= max_voices: stop(oldest_voice(pool))
    clip = random_choice(pool excluding last_played)
    play(clip, bus, pitch = rand(0.95, 1.05), gain_db = rand(-2, 0))

# Next beat from the audio clock
spb = 60 / bpm
pos = playback_position() + output_latency()
wait_for = spb - (pos mod spb)
```

## Gotchas

- **Slider values used as dB** feel dead until the bottom of the range. Convert through `linear_to_db`.
- **Music-streaming loudness (-14 LUFS) is too hot for games.** It leaves no room for dynamics between quiet exploration and loud combat and is far above platform targets.
- **Per-clip balancing** makes a global mix pass impossible. Mix on buses and keep clip gains for normalising source files.
- **Pumping ducking** comes from a fast release or too much ratio. Lengthen the release, lower the ratio, or duck less.
- **One looped track for a whole level** gets tiring fast. Use layers or segments, and add silence; not every moment needs music.
- **Beat sync on frame time** drifts within seconds. Read the playback position and compensate for output latency.
- **Unbounded one-shots** pile up voices and leak players. Cap voices per sound and free or pool players.
- **Sounds that carry gameplay information** (enemy behind you, reload done) need a visual equivalent and must stay distinct from each other; see `game-ui`'s accessibility reference. Offer separate Music, SFX, Voice and UI sliders and a mono toggle.
- **3D sound** needs sensible attenuation: set a max distance per category and check that important cues stay audible at gameplay range.

## References

- [references/adaptive-music.md](references/adaptive-music.md): read when building layered or re-sequenced music, transitions, stingers, intensity mapping or loop points.

## Related skills

- `godot` (audio buses, players, interactive music streams): the engine side in Godot projects.
- `game-feel`: impact timing and juice that audio supports.
- `game-ui`: settings sliders and the accessibility checklist.
