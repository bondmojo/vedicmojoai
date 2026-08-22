# JHora Oracle Fixtures: India and Mojo

## Source and precision

The raw `.jhd` records and screenshots are preserved in [`source/`](source/).
The following data are human transcriptions of values visibly displayed by JHora.
They are suitable to define the initial acceptance contract, but a textual JHora
export can later tighten their display-precision tolerance. The initial reading was
checked by the Opus review; a two-pass human audit remains a release gate. Each
future edit must state its evidence source and reviewer status. Tests consume this
document's corresponding test-only transcription rather than attempting to parse
screenshots.

### Transcription audit status

| Check | Evidence / status |
|---|---|
| First transcription | Direct reading of the preserved JHora screenshots |
| Machine-assisted cross-check | Opus review of the natal/Mahadasha screenshots and fixture text — completed; corrections incorporated. The new AD/PD tables await their equivalent review; neither check is a human audit pass. |
| Human release audit | **Pending** — two independent human reads are required before an SSS release |
| Runtime use | Prohibited; tests use a separately maintained, audited test fixture |

`*.jhd` stores coordinates in a degrees-minutes-like format rather than decimal
degrees. For example, `-74.376167` is displayed by JHora as 74°37′37″ E; the
negative sign is JHora's east-positive storage convention, not a west longitude.

All Dasha timestamps below are local civil timestamps as JHora displays them for
the fixture's saved UTC+05:30 timezone.

## Fixture A — India

| Field | Value |
|---|---|
| Raw record | [`source/india.jhd`](source/india.jhd) |
| Birth date | 1947-08-15 |
| Saved local time | `0.000167` hours ≈ 00:00:00.6012 (JHora display rounds to 00:00:01) |
| Timezone | UTC+05:30 |
| Place | Delhi, India |
| Latitude | 28°40′00″ N |
| Longitude | 77°13′00″ E |

### Displayed natal positions

| Body | Longitude | Nakshatra / pada |
|---|---|---|
| Lagna | Taurus 7°30′43.22″ | Krittika 4 |
| Sun | Cancer 27°34′50.81″ | Asresha 4 |
| Moon | Cancer 4°54′33.65″ | Pushya 1 |
| Mars | Gemini 7°04′13.36″ | Ardra 1 |
| Mercury | Cancer 18°23′18.83″ | Asresha 1 |
| Jupiter | Libra 27°15′07.59″ | Visakha 3 |
| Venus | Cancer 23°57′22.24″ | Asresha 3 |
| Saturn | Cancer 21°58′35.54″ | Asresha 2 |
| Rahu (mean) | Taurus 7°17′20.62″ | Krittika 4 |
| Ketu | Scorpio 7°17′20.62″ | Anuradha 2 |

### Additional displayed points

| Point | Longitude |
|---|---|
| Mandi | Gemini 14°11′37.94″ |
| Gulika | Gemini 4°51′46.96″ |
| Bhava Lagna | Aries 29°15′51.41″ |
| Hora Lagna | Aquarius 1°40′21.25″ |

### Displayed Vimshottari Mahadashas

The panel states “Using true sidereal solar years” and “Started from Moon.”

| Lord | Start | End |
|---|---|---|
| Saturn | 1945-05-13 12:27:17 | 1964-05-13 10:26:51 |
| Mercury | 1964-05-13 10:26:51 | 1981-05-13 20:01:13 |
| Ketu | 1981-05-13 20:01:13 | 1988-05-13 15:29:28 |
| Venus | 1988-05-13 15:29:28 | 2008-05-13 19:41:39 |
| Sun | 2008-05-13 19:41:39 | 2014-05-14 08:57:19 |
| Moon | 2014-05-14 08:57:19 | 2024-05-13 23:03:24 |
| Mars | 2024-05-13 23:03:24 | 2031-05-14 18:31:40 |
| Rahu | 2031-05-14 18:31:40 | 2049-05-14 10:18:38 |
| Jupiter | 2049-05-14 10:18:38 | 2065-05-14 13:40:23 |

### Displayed Antardashas — Mars Mahadasha

Source: [`source/india-mars-md-antardashas.png`](source/india-mars-md-antardashas.png).

| Lord | Start | End |
|---|---|---|
| Mars | 2024-05-13 23:03:24 | 2024-10-13 23:05:47 |
| Rahu | 2024-10-13 23:05:47 | 2025-11-01 06:05:03 |
| Jupiter | 2025-11-01 06:05:03 | 2026-10-08 10:11:16 |
| Saturn | 2026-10-08 10:11:16 | 2027-11-16 15:53:13 |
| Mercury | 2027-11-16 15:53:13 | 2028-11-12 22:49:48 |
| Ketu | 2028-11-12 22:49:48 | 2029-04-07 05:22:18 |
| Venus | 2029-04-07 05:22:18 | 2030-06-08 14:39:40 |
| Sun | 2030-06-08 14:39:40 | 2030-10-17 12:48:50 |
| Moon | 2030-10-17 12:48:50 | 2031-05-14 18:31:40 |

### Displayed Pratyantardashas — Mars / Saturn

Source: [`source/india-mars-saturn-ad-pratyantardashas.png`](source/india-mars-saturn-ad-pratyantardashas.png).

| Lord | Start | End |
|---|---|---|
| Saturn | 2026-10-08 10:11:16 | 2026-12-10 04:54:58 |
| Mercury | 2026-12-10 04:54:58 | 2027-02-03 12:50:12 |
| Ketu | 2027-02-03 12:50:12 | 2027-02-26 12:24:07 |
| Venus | 2027-02-26 12:24:07 | 2027-05-04 20:36:56 |
| Sun | 2027-05-04 20:36:56 | 2027-05-25 14:32:23 |
| Moon | 2027-05-25 14:32:23 | 2027-06-29 13:30:24 |
| Mars | 2027-06-29 13:30:24 | 2027-07-24 02:40:23 |
| Rahu | 2027-07-24 02:40:23 | 2027-09-24 06:13:07 |
| Jupiter | 2027-09-24 06:13:07 | 2027-11-16 15:53:13 |

## Fixture B — Mojo

> This JHora fixture is not the same coordinate record as the existing internal
> Drik “Mojo” test fixture. Do not substitute one for the other.

| Field | Value |
|---|---|
| Raw record | [`source/mojo.jhd`](source/mojo.jhd) |
| Birth date/time | 1984-05-26 07:00:00 |
| Timezone | UTC+05:30 |
| Place | Chittaurgarh, India |
| Latitude | 24°53′19″ N |
| Longitude | 74°37′37″ E |

### Displayed natal positions

| Body | Longitude | Nakshatra / pada | Notes |
|---|---|---|---|
| Lagna | Taurus 29°36′59.12″ | Mrigashira 2 | Near sign boundary |
| Sun | Taurus 11°14′40.14″ | Rohini 1 | |
| Moon | Pisces 17°57′18.41″ | Revati 1 | |
| Mars | Libra 22°11′49.46″ | Visakha 1 | Retrograde |
| Mercury | Aries 20°35′53.06″ | Bharani 3 | |
| Jupiter | Sagittarius 20°53′26.23″ | Purva Ashadha 3 | Retrograde |
| Venus | Taurus 7°19′11.15″ | Krittika 4 | |
| Saturn | Libra 16°29′37.55″ | Swati 3 | Retrograde |
| Rahu (mean) | Taurus 15°28′31.31″ | Rohini 3 | |
| Ketu | Scorpio 15°28′31.31″ | Anuradha 4 | |

### Additional displayed points

| Point | Longitude |
|---|---|
| Mandi | Taurus 23°59′55.15″ |
| Gulika | Taurus 11°11′44.81″ |
| Bhava Lagna | Taurus 29°32′42.23″ |
| Hora Lagna | Gemini 17°53′39.75″ |
| Ghati Lagna | Leo 12°56′32.32″ |
| Vighati Lagna | Taurus 18°10′55.14″ |
| Varnada Lagna | Leo 29°36′59.12″ |
| Sree Lagna | Cancer 4°24′16.12″ |
| Pranapada | Capricorn 18°13′50.56″ |
| Indu Lagna | Virgo 17°57′18.41″ |
| Bhrigu Bindu | Libra 16°26′54.86″ |
| Dhooma | Virgo 24°34′40.14″ |
| Vyatipata | Libra 5°25′19.86″ |

### Displayed Vimshottari Mahadashas

| Lord | Start | End |
|---|---|---|
| Mercury | 1982-10-07 19:08:58 | 1999-10-08 04:43:16 |
| Ketu | 1999-10-08 04:43:16 | 2006-10-08 00:11:30 |
| Venus | 2006-10-08 00:11:30 | 2026-10-08 04:23:35 |
| Sun | 2026-10-08 04:23:35 | 2032-10-07 17:39:13 |
| Moon | 2032-10-07 17:39:13 | 2042-10-08 07:45:16 |
| Mars | 2042-10-08 07:45:16 | 2049-10-08 03:13:30 |
| Rahu | 2049-10-08 03:13:30 | 2067-10-08 19:00:23 |
| Jupiter | 2067-10-08 19:00:23 | 2083-10-08 22:22:03 |
| Saturn | 2083-10-08 22:22:03 | 2102-10-09 20:21:33 |

### Displayed Antardashas — Venus Mahadasha

Source: [`source/mojo-venus-md-antardashas.png`](source/mojo-venus-md-antardashas.png).

| Lord | Start | End |
|---|---|---|
| Venus | 2006-10-08 00:11:30 | 2010-02-03 04:42:31 |
| Sun | 2010-02-03 04:42:31 | 2011-02-03 10:55:07 |
| Moon | 2011-02-03 10:55:07 | 2012-10-07 13:27:07 |
| Mars | 2012-10-07 13:27:07 | 2013-12-06 11:47:43 |
| Rahu | 2013-12-06 11:47:43 | 2016-12-06 06:25:54 |
| Jupiter | 2016-12-06 06:25:54 | 2019-08-07 13:03:15 |
| Saturn | 2019-08-07 13:03:15 | 2022-10-08 03:33:10 |
| Mercury | 2022-10-08 03:33:10 | 2025-08-07 02:18:54 |
| Ketu | 2025-08-07 02:18:54 | 2026-10-08 04:23:35 |

### Displayed Pratyantardashas — Venus / Ketu

Source: [`source/mojo-venus-ketu-ad-pratyantardashas.png`](source/mojo-venus-ketu-ad-pratyantardashas.png).

| Lord | Start | End |
|---|---|---|
| Ketu | 2025-08-07 02:18:54 | 2025-09-01 14:36:33 |
| Venus | 2025-09-01 14:36:33 | 2025-11-11 10:50:56 |
| Sun | 2025-11-11 10:50:56 | 2025-12-02 04:13:49 |
| Moon | 2025-12-02 04:13:49 | 2026-01-05 10:38:02 |
| Mars | 2026-01-05 10:38:02 | 2026-01-29 10:12:09 |
| Rahu | 2026-01-29 10:12:09 | 2026-04-02 03:07:18 |
| Jupiter | 2026-04-02 03:07:18 | 2026-05-29 21:12:48 |
| Saturn | 2026-05-29 21:12:48 | 2026-08-07 21:05:33 |
| Mercury | 2026-08-07 21:05:33 | 2026-10-08 04:23:35 |

## Visual-reference coverage

The source images include D1, D2, D3, D4, D7, D9, D10, D12, D16, D20, D24,
D30, D60, displayed Mahadashas, and the India/Mojo Antardasha and
Pratyantardasha expansions above. These are manual visual comparisons until their
individual values are deliberately transcribed into test expectations.
