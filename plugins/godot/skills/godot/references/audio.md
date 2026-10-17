# Audio

Godot audio API: player nodes, buses and `AudioServer`, volume in dB, positional audio, adaptive music streams, beat sync and import settings. Mix design (bus plans, ducking targets, loudness, adaptive structure) belongs to the `game-audio` skill. Written for Godot 4.x, checked against 4.7.

Contents: Players; Buses; Many sounds at once; Music; Beat sync; Import; Generated audio; Pitfalls.

## Players

| Node | Use |
| --- | --- |
| `AudioStreamPlayer` | Non-positional: music, UI, global SFX |
| `AudioStreamPlayer2D` | 2D positional; volume and pan from distance to the listener |
| `AudioStreamPlayer3D` | 3D positional; `unit_size`, `max_db`, `attenuation_model`, doppler |

- Assign `stream`, set `bus`, call `play()`. The player must be in the tree before `play()`.
- Looping lives on the stream or its import settings (WAV Loop Mode, OGG and MP3 Loop with offset), not the player.
- The current `Camera2D`/`Camera3D` is the listener by default. Add an `AudioListener2D`/`AudioListener3D` and `make_current()` only for a different listening position.
- `max_polyphony` (default 1) caps overlapping plays per player. Retriggering a player at 1 cuts the previous sound.
- 2D players default to `max_distance = 2000.0`, `attenuation = 1.0`.
- 4.7: `area_mask` on the 2D and 3D players defaults to 0 (was 1). `Area2D`/`Area3D` `audio_bus_override` (an underwater bus, a cave reverb) stops affecting players left at the default; set `area_mask` to layer 1 again.

## Buses

Buses are set up in the Audio bottom panel and saved as `default_bus_layout.tres` (path in Project Settings > Audio). `Master` always exists; other buses route to it or to another bus.

```gdscript
func set_bus_linear(bus_name: StringName, linear: float) -> void:
    var i := AudioServer.get_bus_index(bus_name)
    if i == -1:
        push_error("no audio bus %s" % bus_name)
        return
    AudioServer.set_bus_mute(i, linear <= 0.001)
    AudioServer.set_bus_volume_db(i, linear_to_db(maxf(linear, 0.001)))
```

- Volume is in dB: 0 dB is unchanged, about -6 dB is half amplitude, -80 dB is near silence. `volume_db = 0.5` is almost full volume.
- `linear_to_db(0.0)` is `-inf`. Clamp the slider value and mute near zero, as above.
- 4.4+: `volume_linear` on players and `AudioServer.set_bus_volume_linear()` do the conversion for you.
- Bus names are case-sensitive. `get_bus_index("Muisc")` returns -1 and later calls error or do nothing.
- Effects: `add_bus_effect`, `get_bus_effect`, `set_bus_effect_enabled(bus, idx, on)`. Toggle a prebuilt low-pass on the SFX bus for "underwater" rather than adding effects at runtime.
- Common effects: Reverb, Delay, Chorus, Distortion, EQ6/10/21, LowPass/HighPass, Compressor and Limiter (on Master), PitchShift, SpectrumAnalyzer (visualizers), Capture/Record.
- Side-chain ducking: an `AudioEffectCompressor` on the Music bus with `sidechain` set to the Voice bus. Tune threshold, ratio, attack and release by ear.
- Persist bus volumes with `ConfigFile` (see `references/save-and-config.md`) and restore them at startup.

## Many sounds at once

- `AudioStreamRandomizer`: random stream, pitch and volume per play. Use it for footsteps and impacts.
- `AudioStreamPolyphonic`: one player, many overlapping streams.

```gdscript
@onready var sfx: AudioStreamPlayer = $Sfx   # stream = AudioStreamPolyphonic

func play_one(stream: AudioStream) -> void:
    if not sfx.playing:
        sfx.play()
    var pb := sfx.get_stream_playback() as AudioStreamPlaybackPolyphonic
    pb.play_stream(stream, 0.0, 0.0, randf_range(0.95, 1.05))
```

- Or a fixed pool of players in an autoload, taking the first one that is not playing. Avoid `new()` plus `queue_free` per shot in hot paths.

## Music

- Put the music player in an autoload so scene changes do not restart it.
- Crossfade with two players and a parallel tween on `volume_db` (-40 to 0 and back), then `chain().tween_callback(old.stop)`.
- 4.3+ adaptive streams:
  - `AudioStreamPlaylist`: tracks in sequence or shuffled.
  - `AudioStreamSynchronized`: stems in sync; raise layer volumes for intensity.
  - `AudioStreamInteractive`: clips plus a transition table, switched with the `parameter` (clip name) exposed on the player.
- 4.7: `AudioStreamInteractive.TRANSITION_TO_TIME_PREVIOUS_POSITION` resumes the destination clip where it last left off (unverified; check the class reference).
- 4.4+: `AudioStreamWAV.load_from_file(path, options)` loads a WAV at runtime (also `AudioStreamOggVorbis.load_from_file`). Options use the WAV importer's keys.

## Beat sync

`get_playback_position()` only updates per audio mix, so it jitters. Compensate:

```gdscript
const BPM := 120.0
var _last_beat := -1

func _process(_delta: float) -> void:
    var t := music.get_playback_position() + AudioServer.get_time_since_last_mix() \
        - AudioServer.get_output_latency()
    var beat := int(t / (60.0 / BPM))
    if beat != _last_beat:
        _last_beat = beat
        beat_hit.emit(beat)
```

Set BPM, beat count and bar beats in the import dock when a stream needs them for interactive transitions.

## Import

| Format | Use | Notes |
| --- | --- | --- |
| WAV | Short SFX | Low decode cost. Import Compress > Mode: Quite OK Audio is the 4.7 default (good quality, low memory); PCM for the lowest CPU; IMA ADPCM loses quality and seeking. |
| OGG Vorbis | Music, long ambience | Small, streams. |
| MP3 | Fallback for music | Encoder padding adds silence at the start; avoid for timing-critical SFX. |

- Force Mono for 3D positional sources; stereo files spatialize poorly.
- Clicks at start or end: add a 2 to 5 ms fade in the audio file.

## Generated audio

`AudioStreamGenerator` with `AudioStreamGeneratorPlayback.push_frame(Vector2)` (or `push_buffer`) for synthesis. Keep the buffer filled every frame (`get_frames_available()`), or it underruns.

## Pitfalls

- No sound: player not in the tree, wrong or muted bus, or a 3D source beyond `max_distance` with no current camera or listener.
- Music restarts on scene change: the player belongs to the scene, not an autoload.
- Pause menu silences UI sounds: set those players (or their parent) to `process_mode = PROCESS_MODE_ALWAYS`.
- Positional audio has no pan: no current camera or listener in that viewport. Split-screen viewports each need their own.
