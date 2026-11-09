# Rehearsal: Buzzer

Gold: Stageshow `examples/hero-demo` (skill 1.1.1, benjitaylor/skills).
Kept: Stage/Window structure, measured targets, gesture → response, retained layers, cursor, payoff poster and compact scene. Replaced the dashboard, annotation and terminal with the Buzzer roster, turn control, physical buzzer and first reservation. The kit is an unchanged, locally vendored dependency subset.

Place and focus: the existing home, next to the three real navigation actions. One buzzer leads the composition. Two illustrative teams provide context; only the incoming team and the resulting reservation change. No room, game socket, persistence or real events are accessed by the demo.

Beats: enter the squad → host opens the turn → press → sent → confirmed first place → result holds 2.5 s → explicit tap on “Rivedi la demo”. Around 13 s including cursor travel. The confirmed frame is also the poster. The mobile composition is 358 × 342 instead of a scaled desktop; the wide design is 540 × 480. Tablet moves the demo below the navigation to keep the scene at readable size.

Captured: wide and 390 px loops; opening/marks/end with --states at both widths; press at 60 ms; joined at 60 ms; reduced-motion posters; real desktop/tablet/mobile host; browser video of the demo and live host/player flows. Artifacts are in `.taste-skill/motion/` and `.taste-skill/motion-after/` (ignored by Git).

Gate: `rehearsal passed (necessary, not sufficient: references/verify.md and the fresh eye in review.md still stand)` on wide/phone loops, states, press, joined and posters. The stills have complete coverage. Motion captures report **inconclusive** (exit 2) because some rAF sampling intervals exceed the recorder's ~27 ms limit. This is not a complete motion certification; both that status and the gate verdict are retained in the JSON reports.

Corrections from rehearsal:
- Isolated the host's universal radius reset from the kit.
- Fixed compact selectors, cropped the window deliberately, and kept actions inside the frame.
- Re-measured button labels after compact layout/font readiness; no stale wide text widths.
- Reserved the metadata slot with States instead of jumping Voi → 1°.
- Centered buzzer lettering and state as one group.
- Removed redundant “Pronti” so “Le Volpi” reads in full.
- Separated outgoing entry-button ink from incoming team ink (140 ms exit, 160 ms delayed entrance; symmetric replay).
- Kept transform layers only on the three scene elements that move.

Fresh-eye review: independent reviewer followed references/review.md and verify.md, checked the gold, poster wide/phone, loops, press, states, joined and independent ready/replay/check close-ups. Final result: no residual visible finding in reviewed frames. The reviewer explicitly retained the sampling-gap limitation.

Playback: Ferma selects the complete static poster; Riproduci restarts the narrative. Stage aborts/resets unfinished playback offscreen and at hidden tabs, then starts fresh on return. It cleans up its observer, script, cursor timers and animation callbacks. OS reduced motion and Buzzer's local motion setting both use the poster; the visual scene is inert and aria-hidden, with a readable text equivalent outside it.

Assumptions: all names and 0.24 s are illustrative. No real room is called QUIZ by this demo. Existing Buzzer lime, Bricolage Grotesque, physical depth, state cues and Liquid Glass were expressly preserved by the brief.

Not checked: physical iOS/Android devices, Safari/WebKit rendering, mobile radio suspension, packet loss on a real remote deployment and frame-perfect behavior in the recorder's sampling gaps. Browser verification used installed Chrome via Playwright on macOS, with mobile viewports/touch emulation and separate contexts for host, players and TV.
