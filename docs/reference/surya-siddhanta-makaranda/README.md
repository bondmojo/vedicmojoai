# Sri Surya Siddhanta — Generalized Makaranda Reference Bundle

This directory preserves the user-supplied JHora evidence used to specify and
validate the planned `surya_siddhanta_makaranda_v1` calculation profile.

It is **reference data only**. Nothing in this directory is executable input to
the application, and JHora is used as an output oracle—not as a runtime
dependency or a source of copied implementation code.

## Contents

- [JHora settings and fixture transcription](fixtures.md) — approved calculation
  contract, decoded `.jhd` inputs, displayed longitudes, and Vimshottari outputs.
- [Mojo settings evidence](mojo-settings.md) — values shown in the three JHora
  options screenshots.
- [`source/`](source/) — unmodified JHora birth records and the original
  user-provided screenshots, renamed only for stable paths.

## Evidence scope

The inputs and outputs establish the following approved target:

```text
Sri Surya Siddhanta — generalized Makaranda
Sri Surya Siddhanta ayanamsa (no additional adjustment)
Mean nodes
Whole-sign houses
Precise astronomical sunrise convention retained by VedicMojoAI
Vimshottari: Janma Tara (Moon), D1, Krittika allocated to Sun,
zodiacal forward sequence, true sidereal solar years
```

The two charts are deliberately retained separately from the existing internal
“Mojo” Drik test fixture. Their coordinates are not interchangeable.

## Handling guidance

- Do not edit source artifacts. Add a new dated artifact when revised JHora output
  is supplied.
- Tests should use human-reviewed, independently typed fixtures—not OCR or a parser
  of these screenshots.
- Any implemented formula must be independently derived from authorized classical
  source material and documented in the implementation spec.
