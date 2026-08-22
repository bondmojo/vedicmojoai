# Mojo — JHora Settings Evidence

Source screenshots are preserved in [`source/`](source/). These observations are a
manual transcription of the visible UI, not an interpretation of hidden JHora
preferences.

## Planet Calculation Options

The dialog shows:

| Setting | Visible value | Treatment in our profile |
|---|---|---|
| Position reference | Geocentric positions | JHora notes this screen is irrelevant when SSS is active; do not model it as an SSS switch. |
| Position type | True positions | Drik-only control per JHora note. |
| Refraction | Do not use refraction | Drik-only control per JHora note. |
| Annual aberration | Use annual aberration of light | Drik-only control per JHora note. |
| Gravitational deflection | Use gravitational deflection | Drik-only control per JHora note. |
| Nutation | Use nutation | Drik-only control per JHora note. |
| Nodes | **Mean nodes** | Normative SSS/Makaranda profile setting. |

The dialog explicitly says that, while using **SSS (Sri Surya Siddhanta)**,
changing these controls does not make a difference; they apply only to Drik
Siddhanta. This is why the production profile records mean nodes but does not
falsely describe Drik apparent-position toggles as SSS formula choices.

## Ayanamsa

The Select Ayanamsa dialog shows:

```text
Sri Surya Siddhanta
Additional adjustment: disabled
Adjustment fields: 0° 0′ 0″
```

## Nakshatra Dasa Options

| Setting | Visible value |
|---|---|
| Nakshatra dasa starting point | Janma tara (Moon) |
| Divisional chart | Rasi (D-1) |
| Nakshatra ownership base | Krittika (allocated to Sun) |
| Reckon everything antizodiacally | unchecked |
| Antardasha sequence | `F, G, H, A, B, C, D, E` — start from the dasa lord and go forward |

The background Vimshottari panel visibly states **“Using true sidereal solar
years”** and **“Started from Moon.”**

## Sunrise evidence and profile rule

The fixture displays Bhava Lagna and Hora Lagna values that are consistent with a
real sunrise near 05:47 local time at Chittaurgarh, not a 06:00 placeholder. This
corroborates the approved product rule: SSS/Makaranda always uses the current
precise astronomical sunrise instant, and gets the Sun's longitude at that instant
from the SSS provider. The legacy JHora 06:00 sunrise option is not an SSS fallback.

For pre-sunrise births, the same rule uses the most recent sunrise on the preceding
civil day. India provides the sharper regression oracle: its displayed Bhava Lagna
and Hora Lagna resolve to the preceding day's sunrise, rather than a future sunrise
or a 06:00 placeholder.
