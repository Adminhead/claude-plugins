# Game accessibility checklist

A working checklist paraphrased from the [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/) (a collaboration of studios, specialists and academics). Each line links to the guideline page, which has the rationale, player quotes and shipped examples. Numbers below were read from those pages on 2026-10-17. The site groups guidelines as Basic (cheap, wide reach), Intermediate (some planning) and Advanced (specialist); this file keeps that split and regroups by what you build.

For the platform holders' versions, see the [Xbox Accessibility Guidelines](https://learn.microsoft.com/gaming/accessibility/guidelines). Communication features (text and voice chat) in games sold in the US fall under the CVAA; check the current FCC rules before shipping chat.

## Contents

1. Basic checklist (ship this on every game)
2. Text and readability
3. Subtitles and captions
4. Controls and input
5. Visual information and colour
6. Audio information
7. Motion, flashing and comfort
8. Difficulty, assists and pacing
9. Settings menu design
10. Testing

## 1. Basic checklist

Copy this into the review and tick each item.

- [ ] Default text is readable at the target viewing distance ([font size](https://gameaccessibilityguidelines.com/use-an-easily-readable-default-font-size/)).
- [ ] Text and UI contrast strongly with their background ([contrast](https://gameaccessibilityguidelines.com/provide-high-contrast-between-text-ui-and-background/)).
- [ ] No essential information relies on colour alone ([colour](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-fixed-colour-alone/)) or sound alone ([sound](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-sounds-alone/)).
- [ ] Subtitles exist for all important speech and are presented clearly ([subtitles](https://gameaccessibilityguidelines.com/provide-subtitles-for-all-important-speech/), [presentation](https://gameaccessibilityguidelines.com/if-any-subtitles-captions-are-used-present-them-in-a-clear-easy-to-read-way/)).
- [ ] Separate volume controls for music, effects and speech ([volume](https://gameaccessibilityguidelines.com/provide-separate-volume-controls-or-mutes-for-effects-speech-and-background-music/)).
- [ ] Controls can be remapped ([remap](https://gameaccessibilityguidelines.com/allow-controls-to-be-remapped-reconfigured/)) and the whole UI works with the gameplay input device ([same input](https://gameaccessibilityguidelines.com/ensure-that-all-areas-of-the-user-interface-can-be-accessed-using-the-same-input-method-as-the-gameplay/)).
- [ ] Control sensitivity is adjustable ([sensitivity](https://gameaccessibilityguidelines.com/include-an-option-to-adjust-the-sensitivity-of-controls/)) and haptics can be turned down or off ([haptics](https://gameaccessibilityguidelines.com/include-toggle-slider-for-any-haptics/)).
- [ ] Touch targets are large and well spaced ([targets](https://gameaccessibilityguidelines.com/ensure-interactive-elements-virtual-controls-are-large-and-well-spaced-particularly-on-small-or-touch-screens/)).
- [ ] No flashing or high-contrast patterns past the thresholds in section 7 ([flicker](https://gameaccessibilityguidelines.com/avoid-flickering-images-and-repetitive-patterns/)).
- [ ] Text prompts advance at the player's pace ([pace](https://gameaccessibilityguidelines.com/allow-players-to-progress-through-text-prompts-at-their-own-pace/)).
- [ ] The game can start without digging through menus ([start](https://gameaccessibilityguidelines.com/allow-the-game-to-be-started-without-the-need-to-navigate-through-multiple-levels-of-menus/)).
- [ ] A wide choice of difficulty levels ([difficulty](https://gameaccessibilityguidelines.com/offer-a-wide-choice-of-difficulty-levels/)).
- [ ] All settings are saved and remembered ([persist](https://gameaccessibilityguidelines.com/ensure-that-all-settings-are-saved-remembered/)), and the accessibility features are described in-game and on the store page ([in-game](https://gameaccessibilityguidelines.com/provide-details-of-accessibility-features-in-game/), [store](https://gameaccessibilityguidelines.com/provide-details-of-accessibility-features-on-packaging-and-or-website/)).
- [ ] There is a channel for accessibility feedback ([feedback](https://gameaccessibilityguidelines.com/solicit-accessibility-feedback/)).

## 2. Text and readability

- Default body text of at least about 28 px at 1080p, scaled for TV distance ([font size](https://gameaccessibilityguidelines.com/use-an-easily-readable-default-font-size/)); offer a text-size option ([adjust font](https://gameaccessibilityguidelines.com/allow-the-font-size-to-be-adjusted/)) and, better, UI scaling ([resize](https://gameaccessibilityguidelines.com/allow-interfaces-to-be-resized/)).
- Aim for a contrast ratio of at least 4.5:1 between text and background, the WCAG 2 AA level the guideline cites ([contrast](https://gameaccessibilityguidelines.com/provide-high-contrast-between-text-ui-and-background/)). Text over busy scenery needs a backing panel or outline.
- Plain formatting: sentence case over all-caps blocks, left-aligned, short lines, a clean sans-serif ([formatting](https://gameaccessibilityguidelines.com/use-simple-clear-text-formatting/)); plain language ([language](https://gameaccessibilityguidelines.com/use-simple-clear-language/)).
- Highlight key words (item names, objectives) consistently ([highlight](https://gameaccessibilityguidelines.com/highlight-important-words/)); offer a text colour or high-contrast choice ([text colour](https://gameaccessibilityguidelines.com/provide-a-choice-of-text-colour-low-high-contrast-choice-as-a-minimum/)).
- Reinforce instructions with visuals or speech, not text alone ([not text alone](https://gameaccessibilityguidelines.com/ensure-no-essential-information-especially-instructions-is-conveyed-by-text-alone-reinforce-with-visuals-and-or-speech/)).
- Advanced: screen-reader support for menus ([screen reader](https://gameaccessibilityguidelines.com/ensure-screenreader-support-including-menus-installers/)), or voiced menus.

## 3. Subtitles and captions

- Presentation ([clear subtitles](https://gameaccessibilityguidelines.com/if-any-subtitles-captions-are-used-present-them-in-a-clear-easy-to-read-way/)): at least about 46 px at 1080p by default or by option, no more than two lines (three only in exceptional cases), about 40 characters per line at most, on a solid or semi-opaque backing box, ideally with an outline or shadow too.
- Offer subtitles before any audio plays, for example on the first boot screen ([before sound](https://gameaccessibilityguidelines.com/ensure-subtitles-captions-are-or-can-be-turned-on-before-any-sound-is-played/)).
- Show who is speaking: a name label, colour plus name, or an on-screen marker ([speaker](https://gameaccessibilityguidelines.com/provide-a-visual-indication-of-who-is-currently-speaking/)).
- Caption significant non-speech sounds (`[footsteps behind]`, `[alarm]`) ([captions](https://gameaccessibilityguidelines.com/provide-captions-or-visuals-for-significant-background-sounds/)); subtitle supplementary barks too ([supplementary](https://gameaccessibilityguidelines.com/provide-subtitles-for-supplementary-speech/)).
- Let players customise size, background opacity and colour ([customise](https://gameaccessibilityguidelines.com/allow-subtitle-caption-presentation-to-be-customised/)).
- Reading speed: follow TV subtitling norms for the audience's age ([wpm](https://gameaccessibilityguidelines.com/ensure-that-subtitles-captions-are-cut-down-to-and-presented-at-an-appropriate-words-per-minute-for-the-target-age-group/)); the guideline points at broadcaster guidance such as the BBC's rather than fixing a number.

## 4. Controls and input

- Full remapping, including mouse, keyboard and gamepad, with conflicts flagged rather than silently swapped ([remap](https://gameaccessibilityguidelines.com/allow-controls-to-be-remapped-reconfigured/)).
- Toggle alternatives to holding a button ([hold](https://gameaccessibilityguidelines.com/avoid-provide-alternatives-to-requiring-buttons-to-be-held-down/)); alternatives to button-mashing and quick-time events ([mash](https://gameaccessibilityguidelines.com/avoid-repeated-inputs-button-mashing-quick-time-events/)).
- Every key action reachable with digital input; analogue, gesture or speech only as alternatives ([digital](https://gameaccessibilityguidelines.com/ensure-that-all-key-actions-can-be-carried-out-by-digital-controls-pad-keys-presses-with-more-complex-input-eg-analogue-speech-gesture-not-required-and-included-only-as-supplementary-al/)); no required simultaneous actions such as click-drag ([simultaneous](https://gameaccessibilityguidelines.com/ensure-that-multiple-simultaneous-actions-eg-click-drag-or-swipe-are-not-required-and-included-only-as-a-supplementary-alternative-input-method/)).
- Support more than one input device ([devices](https://gameaccessibilityguidelines.com/support-more-than-one-input-device/)); keep precise-accuracy targets stationary ([stationary](https://gameaccessibilityguidelines.com/make-interactive-elements-that-require-accuracy-eg-cursor-touch-controlled-menu-options-stationary/)).
- Simplify controls or offer a simpler scheme ([simple](https://gameaccessibilityguidelines.com/ensure-controls-are-as-simple-as-possible-or-provide-a-simpler-alternative/)); show a reminder of controls during play ([reminder](https://gameaccessibilityguidelines.com/indicate-allow-reminder-of-controls-during-gameplay/)).
- Advanced: switch and eye-tracking compatible schemes ([switch](https://gameaccessibilityguidelines.com/provide-very-simple-control-schemes-that-are-compatible-with-assistive-technology-devices-such-as-switch-or-eye-tracking/)); an optional input cool-down of about 0.5 s for tremor ([cool-down](https://gameaccessibilityguidelines.com/include-a-cool-down-period-post-acceptance-delay-of-0-5-seconds-between-inputs/)); no essential precise timing, or a skip ([timing](https://gameaccessibilityguidelines.com/do-not-make-precise-timing-essential-to-gameplay-offer-alternatives-actions-that-can-be-carried-out-while-paused-or-a-skip-mechanism/)).

## 5. Visual information and colour

- Pair every colour cue with a shape, icon, pattern or label ([colour](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-fixed-colour-alone/)). Colour-blind presets are a supplement, not the fix.
- Make interactive things look interactive, consistently ([interactive](https://gameaccessibilityguidelines.com/give-a-clear-indication-that-interactive-elements-are-interactive/)).
- Keep essential temporary information near the player's eye-line, not in a far corner ([eye-line](https://gameaccessibilityguidelines.com/avoid-placing-essential-temporary-information-outside-the-players-eye-line/)).
- Offer crosshair and cursor colour and shape choices ([crosshair](https://gameaccessibilityguidelines.com/provide-a-choice-of-cursor-crosshair-colours-designs/)) and a contrast option ([contrast option](https://gameaccessibilityguidelines.com/provide-an-option-to-adjust-contrast/)).
- 3D: a sensible default field of view for the viewing setup and a FOV slider ([FOV default](https://gameaccessibilityguidelines.com/if-the-game-uses-field-of-view-3d-engine-only-set-an-appropriate-default-for-the-expected-viewing-environment/), [FOV adjust](https://gameaccessibilityguidelines.com/if-the-game-uses-field-of-view-3d-engine-only-allow-a-means-for-it-to-be-adjusted/)).
- Let players hide non-essential HUD and background movement ([hide](https://gameaccessibilityguidelines.com/provide-an-option-to-turn-off-hide-all-non-interactive-elements/), [background](https://gameaccessibilityguidelines.com/provide-an-option-to-turn-off-hide-background-movement/)).

## 6. Audio information

- Anything audio tells the player (enemy direction, off-screen threats) also appears visually, for example a directional damage indicator ([replicate](https://gameaccessibilityguidelines.com/ensure-that-all-important-supplementary-information-eg-the-direction-you-are-being-shot-from-conveyed-by-audio-is-replicated-in-text-visuals/)).
- A stereo or mono toggle ([mono](https://gameaccessibilityguidelines.com/provide-a-stereo-mono-toggle/)); keep background noise low under speech ([under speech](https://gameaccessibilityguidelines.com/keep-background-noise-to-minimum-during-speech/)); make key sounds distinct from each other ([distinct](https://gameaccessibilityguidelines.com/ensure-sound-music-choices-for-each-key-objects-events-are-distinct-from-each-other/)). The mix side of this is in the `game-audio` skill.
- Multiplayer: text chat beside voice and voice beside text, plus pings or quick-chat ([text chat](https://gameaccessibilityguidelines.com/support-text-chat-as-well-as-voice-for-multiplayer/), [visual comms](https://gameaccessibilityguidelines.com/provide-visual-means-of-communicating-in-multiplayer/)).

## 7. Motion, flashing and comfort

- Flashing ([flicker](https://gameaccessibilityguidelines.com/avoid-flickering-images-and-repetitive-patterns/)). Avoid: more than three flashes in one second over 25% or more of the screen; flashing sequences longer than 5 seconds; moving high-contrast repeating patterns (about 5 or more stripes) over 25% of the screen; static ones (about 8 or more stripes) over 40%. A flash includes a big brightness jump, a fast cut, or a change to or from saturated red. The guideline points to the paid Harding test and Ofcom's broadcast guidance for formal checks.
- Offer reduce-motion, camera-shake, head-bob, motion-blur and screen-flash toggles; coordinate with `game-feel`.
- Avoid sudden unexpected movement or events, or offer an option ([sudden](https://gameaccessibilityguidelines.com/avoid-any-sudden-unexpected-movement-or-events/)); don't decouple camera from controller movement without an option ([camera](https://gameaccessibilityguidelines.com/avoid-or-provide-option-to-disable-any-difference-between-controller-movement-and-camera-movement/)).
- VR: avoid simulation-sickness triggers such as forced camera motion and acceleration ([VR](https://gameaccessibilityguidelines.com/avoid-vr-simulation-sickness-triggers/)).

## 8. Difficulty, assists and pacing

- Several difficulty levels, changeable mid-game ([choice](https://gameaccessibilityguidelines.com/offer-a-wide-choice-of-difficulty-levels/), [mid-game](https://gameaccessibilityguidelines.com/allow-difficulty-level-to-be-altered-during-gameplay-either-through-settings-or-adaptive-difficulty/)).
- Assists such as aim assist and steering assist ([assists](https://gameaccessibilityguidelines.com/include-assist-modes-such-as-auto-aim-and-assisted-steering/)); a game-speed option ([speed](https://gameaccessibilityguidelines.com/include-an-option-to-adjust-the-game-speed/)); expose individual tuning variables where possible ([variables](https://gameaccessibilityguidelines.com/allow-gameplay-to-be-fine-tuned-by-exposing-as-many-variables-as-possible/)).
- A way to skip gameplay that isn't the core mechanic, such as a minigame ([skip](https://gameaccessibilityguidelines.com/offer-a-means-to-bypass-gameplay-elements-that-arent-part-of-the-core-mechanic-via-settings-or-in-game-skip-option/)).
- Practice without failure ([practice](https://gameaccessibilityguidelines.com/include-a-means-of-practicing-without-failure-such-as-a-practice-level-or-sandbox-mode/)), interactive tutorials ([tutorials](https://gameaccessibilityguidelines.com/include-interactive-tutorials/)), objective reminders ([objectives](https://gameaccessibilityguidelines.com/indicate-allow-reminder-of-current-objectives-during-gameplay/)) and story recaps ([summaries](https://gameaccessibilityguidelines.com/if-using-a-long-overarching-narrative-provide-summaries-of-progress/)).
- Autosave plus manual save ([autosave](https://gameaccessibilityguidelines.com/provide-an-autosave-feature/), [manual](https://gameaccessibilityguidelines.com/provide-a-manual-save-feature/)).
- Competitive multiplayer: let players choose whether to match with others who use advantage-giving assists ([matchmaking](https://gameaccessibilityguidelines.com/allow-a-preference-to-be-set-for-playing-online-multiplayer-with-without-others-who-are-using-accessibility-features-that-could-give-a-competitive-advantage/)).

## 9. Settings menu design

- Offer a short accessibility prompt on first boot (subtitles, text size, colour-blind mode, presets) before the first audio or cutscene.
- Group options by need (Vision, Hearing, Motor, Cognitive) or by system (Display, Audio, Controls, Gameplay), with a preview for each visual option.
- Apply changes live where possible, keep a "reset to default", and persist everything, ideally in profiles ([profiles](https://gameaccessibilityguidelines.com/allow-settings-to-be-saved-to-different-profiles-at-either-game-or-platform-level/)).
- The settings menu must itself be accessible: readable at default size, fully navigable by gamepad, and reachable from the pause menu, not only the title screen.

## 10. Testing

- Include players with disabilities among playtesters ([playtesters](https://gameaccessibilityguidelines.com/include-some-people-with-impairments-amongst-play-testing-participants/)); see the `game-playtest` skill for running sessions.
- Self-checks: play a session with sound off and subtitles on; with a colour-blindness filter; at couch distance; gamepad only; with one hand on the default bindings; at the largest text size.
