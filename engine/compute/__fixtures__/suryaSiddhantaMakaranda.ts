/**
 * Test-only human transcription of the local JHora oracle bundle.
 *
 * Evidence: docs/reference/surya-siddhanta-makaranda/fixtures.md and the
 * preserved source screenshots/.jhd files. First reader: project owner;
 * independent machine-assisted review: Opus review recorded in that document;
 * human release audit: pending. These values are never runtime input, and no
 * test parses a JHora artifact at runtime.
 */

export type SssFixtureId = 'india' | 'mojo'
export type SssDashaLevel = 'MD' | 'AD' | 'PD'

export interface SssFixtureLongitude {
  readonly body: string
  readonly longitude: number
  readonly nakshatra: string
  readonly pada: number
  readonly retrograde: boolean
}

export interface SssFixturePoint {
  readonly name: string
  readonly longitude: number
}

export interface SssFixtureDashaPeriod {
  /** Stable test-only identity, not an application persistence identifier. */
  readonly id: string
  readonly level: SssDashaLevel
  /** The containing MD or AD identity; MD entries have no parent. */
  readonly parentId: string | null
  readonly lord: string
  /** JHora-displayed local ISO-8601 timestamp including the saved +05:30 offset. */
  readonly start: string
  readonly end: string
}

export interface SssFixture {
  readonly id: SssFixtureId
  readonly source: string
  readonly transcription: {
    readonly firstReader: 'project owner'
    readonly independentReviewer: 'Opus review'
    readonly humanReleaseAudit: 'pending'
  }
  readonly birth: {
    readonly date: string
    readonly time: string
    readonly timezone: number
    readonly latitude: number
    readonly longitude: number
  }
  /** Lagna plus all nine grahas, with displayed nakshatra/pada and motion notes. */
  readonly natal: readonly SssFixtureLongitude[]
  /** Solar-derived points and Mandi/Gulika shown by the source record. */
  readonly upagrahas: readonly SssFixturePoint[]
  /** Special lagnas shown by the source record. */
  readonly specialLagnas: readonly SssFixturePoint[]
  /** Displayed points which are neither a special lagna nor an upagraha. */
  readonly additionalPoints: readonly SssFixturePoint[]
  readonly dasha: {
    readonly source: string
    readonly review: {
      readonly mahadasha: 'Opus review'
      readonly antardashaAndPratyantardasha: 'pending'
    }
    readonly seed: 'moon_janma_tara'
    readonly division: 'D1'
    readonly firstNakshatra: 'Krittika'
    readonly firstNakshatraLord: 'Sun'
    readonly direction: 'zodiacal_forward'
    readonly yearBasis: 'true_sidereal_solar_revolution'
  }
  readonly mahadasha: readonly SssFixtureDashaPeriod[]
  readonly antardasha: readonly SssFixtureDashaPeriod[]
  readonly pratyantardasha: readonly SssFixtureDashaPeriod[]
}

const degree = (sign: number, degrees: number, minutes: number, seconds: number): number =>
  (sign - 1) * 30 + degrees + minutes / 60 + seconds / 3600

const mdId = (lord: string, start: string): string => `MD:${lord}:${start}`
const adId = (parentId: string, lord: string, start: string): string => `${parentId}/AD:${lord}:${start}`
const pdId = (parentId: string, lord: string, start: string): string => `${parentId}/PD:${lord}:${start}`

const md = (lord: string, start: string, end: string): SssFixtureDashaPeriod => ({
  id: mdId(lord, start),
  level: 'MD',
  parentId: null,
  lord,
  start,
  end,
})

const ad = (
  parentId: string,
  lord: string,
  start: string,
  end: string
): SssFixtureDashaPeriod => ({
  id: adId(parentId, lord, start),
  level: 'AD',
  parentId,
  lord,
  start,
  end,
})

const pd = (
  parentId: string,
  lord: string,
  start: string,
  end: string
): SssFixtureDashaPeriod => ({
  id: pdId(parentId, lord, start),
  level: 'PD',
  parentId,
  lord,
  start,
  end,
})

const INDIA_MARS_MD_START = '2024-05-13T23:03:24+05:30'
const INDIA_MARS_MD_ID = mdId('Mars', INDIA_MARS_MD_START)
const INDIA_MARS_SATURN_AD_START = '2026-10-08T10:11:16+05:30'
const INDIA_MARS_SATURN_AD_ID = adId(INDIA_MARS_MD_ID, 'Saturn', INDIA_MARS_SATURN_AD_START)

const MOJO_VENUS_MD_START = '2006-10-08T00:11:30+05:30'
const MOJO_VENUS_MD_ID = mdId('Venus', MOJO_VENUS_MD_START)
const MOJO_VENUS_KETU_AD_START = '2025-08-07T02:18:54+05:30'
const MOJO_VENUS_KETU_AD_ID = adId(MOJO_VENUS_MD_ID, 'Ketu', MOJO_VENUS_KETU_AD_START)

export const SURYA_SIDDHANTA_MAKARANDA_FIXTURES: readonly SssFixture[] = [
  {
    id: 'india',
    source: 'docs/reference/surya-siddhanta-makaranda/fixtures.md#fixture-a--india',
    transcription: {
      firstReader: 'project owner',
      independentReviewer: 'Opus review',
      humanReleaseAudit: 'pending',
    },
    birth: {
      date: '1947-08-15',
      time: '00:00:00.6012',
      timezone: 5.5,
      latitude: 28 + 40 / 60,
      longitude: 77 + 13 / 60,
    },
    natal: [
      { body: 'Lagna', longitude: degree(2, 7, 30, 43.22), nakshatra: 'Krittika', pada: 4, retrograde: false },
      { body: 'Sun', longitude: degree(4, 27, 34, 50.81), nakshatra: 'Asresha', pada: 4, retrograde: false },
      { body: 'Moon', longitude: degree(4, 4, 54, 33.65), nakshatra: 'Pushya', pada: 1, retrograde: false },
      { body: 'Mars', longitude: degree(3, 7, 4, 13.36), nakshatra: 'Ardra', pada: 1, retrograde: false },
      { body: 'Mercury', longitude: degree(4, 18, 23, 18.83), nakshatra: 'Asresha', pada: 1, retrograde: false },
      { body: 'Jupiter', longitude: degree(7, 27, 15, 7.59), nakshatra: 'Visakha', pada: 3, retrograde: false },
      { body: 'Venus', longitude: degree(4, 23, 57, 22.24), nakshatra: 'Asresha', pada: 3, retrograde: false },
      { body: 'Saturn', longitude: degree(4, 21, 58, 35.54), nakshatra: 'Asresha', pada: 2, retrograde: false },
      { body: 'Rahu', longitude: degree(2, 7, 17, 20.62), nakshatra: 'Krittika', pada: 4, retrograde: true },
      { body: 'Ketu', longitude: degree(8, 7, 17, 20.62), nakshatra: 'Anuradha', pada: 2, retrograde: true },
    ],
    upagrahas: [
      { name: 'Mandi', longitude: degree(3, 14, 11, 37.94) },
      { name: 'Gulika', longitude: degree(3, 4, 51, 46.96) },
    ],
    specialLagnas: [
      { name: 'Bhava Lagna', longitude: degree(1, 29, 15, 51.41) },
      { name: 'Hora Lagna', longitude: degree(11, 1, 40, 21.25) },
    ],
    additionalPoints: [],
    dasha: {
      source: 'docs/reference/surya-siddhanta-makaranda/fixtures.md#displayed-vimshottari-mahadashas',
      review: {
        mahadasha: 'Opus review',
        antardashaAndPratyantardasha: 'pending',
      },
      seed: 'moon_janma_tara',
      division: 'D1',
      firstNakshatra: 'Krittika',
      firstNakshatraLord: 'Sun',
      direction: 'zodiacal_forward',
      yearBasis: 'true_sidereal_solar_revolution',
    },
    mahadasha: [
      md('Saturn', '1945-05-13T12:27:17+05:30', '1964-05-13T10:26:51+05:30'),
      md('Mercury', '1964-05-13T10:26:51+05:30', '1981-05-13T20:01:13+05:30'),
      md('Ketu', '1981-05-13T20:01:13+05:30', '1988-05-13T15:29:28+05:30'),
      md('Venus', '1988-05-13T15:29:28+05:30', '2008-05-13T19:41:39+05:30'),
      md('Sun', '2008-05-13T19:41:39+05:30', '2014-05-14T08:57:19+05:30'),
      md('Moon', '2014-05-14T08:57:19+05:30', '2024-05-13T23:03:24+05:30'),
      md('Mars', INDIA_MARS_MD_START, '2031-05-14T18:31:40+05:30'),
      md('Rahu', '2031-05-14T18:31:40+05:30', '2049-05-14T10:18:38+05:30'),
      md('Jupiter', '2049-05-14T10:18:38+05:30', '2065-05-14T13:40:23+05:30'),
    ],
    antardasha: [
      ad(INDIA_MARS_MD_ID, 'Mars', INDIA_MARS_MD_START, '2024-10-13T23:05:47+05:30'),
      ad(INDIA_MARS_MD_ID, 'Rahu', '2024-10-13T23:05:47+05:30', '2025-11-01T06:05:03+05:30'),
      ad(INDIA_MARS_MD_ID, 'Jupiter', '2025-11-01T06:05:03+05:30', '2026-10-08T10:11:16+05:30'),
      ad(INDIA_MARS_MD_ID, 'Saturn', INDIA_MARS_SATURN_AD_START, '2027-11-16T15:53:13+05:30'),
      ad(INDIA_MARS_MD_ID, 'Mercury', '2027-11-16T15:53:13+05:30', '2028-11-12T22:49:48+05:30'),
      ad(INDIA_MARS_MD_ID, 'Ketu', '2028-11-12T22:49:48+05:30', '2029-04-07T05:22:18+05:30'),
      ad(INDIA_MARS_MD_ID, 'Venus', '2029-04-07T05:22:18+05:30', '2030-06-08T14:39:40+05:30'),
      ad(INDIA_MARS_MD_ID, 'Sun', '2030-06-08T14:39:40+05:30', '2030-10-17T12:48:50+05:30'),
      ad(INDIA_MARS_MD_ID, 'Moon', '2030-10-17T12:48:50+05:30', '2031-05-14T18:31:40+05:30'),
    ],
    pratyantardasha: [
      pd(INDIA_MARS_SATURN_AD_ID, 'Saturn', INDIA_MARS_SATURN_AD_START, '2026-12-10T04:54:58+05:30'),
      pd(INDIA_MARS_SATURN_AD_ID, 'Mercury', '2026-12-10T04:54:58+05:30', '2027-02-03T12:50:12+05:30'),
      pd(INDIA_MARS_SATURN_AD_ID, 'Ketu', '2027-02-03T12:50:12+05:30', '2027-02-26T12:24:07+05:30'),
      pd(INDIA_MARS_SATURN_AD_ID, 'Venus', '2027-02-26T12:24:07+05:30', '2027-05-04T20:36:56+05:30'),
      pd(INDIA_MARS_SATURN_AD_ID, 'Sun', '2027-05-04T20:36:56+05:30', '2027-05-25T14:32:23+05:30'),
      pd(INDIA_MARS_SATURN_AD_ID, 'Moon', '2027-05-25T14:32:23+05:30', '2027-06-29T13:30:24+05:30'),
      pd(INDIA_MARS_SATURN_AD_ID, 'Mars', '2027-06-29T13:30:24+05:30', '2027-07-24T02:40:23+05:30'),
      pd(INDIA_MARS_SATURN_AD_ID, 'Rahu', '2027-07-24T02:40:23+05:30', '2027-09-24T06:13:07+05:30'),
      pd(INDIA_MARS_SATURN_AD_ID, 'Jupiter', '2027-09-24T06:13:07+05:30', '2027-11-16T15:53:13+05:30'),
    ],
  },
  {
    id: 'mojo',
    source: 'docs/reference/surya-siddhanta-makaranda/fixtures.md#fixture-b--mojo',
    transcription: {
      firstReader: 'project owner',
      independentReviewer: 'Opus review',
      humanReleaseAudit: 'pending',
    },
    birth: {
      date: '1984-05-26',
      time: '07:00:00',
      timezone: 5.5,
      latitude: 24 + 53 / 60 + 19 / 3600,
      longitude: 74 + 37 / 60 + 37 / 3600,
    },
    natal: [
      { body: 'Lagna', longitude: degree(2, 29, 36, 59.12), nakshatra: 'Mrigashira', pada: 2, retrograde: false },
      { body: 'Sun', longitude: degree(2, 11, 14, 40.14), nakshatra: 'Rohini', pada: 1, retrograde: false },
      { body: 'Moon', longitude: degree(12, 17, 57, 18.41), nakshatra: 'Revati', pada: 1, retrograde: false },
      { body: 'Mars', longitude: degree(7, 22, 11, 49.46), nakshatra: 'Visakha', pada: 1, retrograde: true },
      { body: 'Mercury', longitude: degree(1, 20, 35, 53.06), nakshatra: 'Bharani', pada: 3, retrograde: false },
      { body: 'Jupiter', longitude: degree(9, 20, 53, 26.23), nakshatra: 'Purva Ashadha', pada: 3, retrograde: true },
      { body: 'Venus', longitude: degree(2, 7, 19, 11.15), nakshatra: 'Krittika', pada: 4, retrograde: false },
      { body: 'Saturn', longitude: degree(7, 16, 29, 37.55), nakshatra: 'Swati', pada: 3, retrograde: true },
      { body: 'Rahu', longitude: degree(2, 15, 28, 31.31), nakshatra: 'Rohini', pada: 3, retrograde: true },
      { body: 'Ketu', longitude: degree(8, 15, 28, 31.31), nakshatra: 'Anuradha', pada: 4, retrograde: true },
    ],
    upagrahas: [
      { name: 'Mandi', longitude: degree(2, 23, 59, 55.15) },
      { name: 'Gulika', longitude: degree(2, 11, 11, 44.81) },
      { name: 'Dhooma', longitude: degree(6, 24, 34, 40.14) },
      { name: 'Vyatipata', longitude: degree(7, 5, 25, 19.86) },
    ],
    specialLagnas: [
      { name: 'Bhava Lagna', longitude: degree(2, 29, 32, 42.23) },
      { name: 'Hora Lagna', longitude: degree(3, 17, 53, 39.75) },
      { name: 'Ghati Lagna', longitude: degree(5, 12, 56, 32.32) },
      { name: 'Vighati Lagna', longitude: degree(2, 18, 10, 55.14) },
      { name: 'Varnada Lagna', longitude: degree(5, 29, 36, 59.12) },
      { name: 'Sree Lagna', longitude: degree(4, 4, 24, 16.12) },
      { name: 'Pranapada', longitude: degree(10, 18, 13, 50.56) },
      { name: 'Indu Lagna', longitude: degree(6, 17, 57, 18.41) },
    ],
    additionalPoints: [
      { name: 'Bhrigu Bindu', longitude: degree(7, 16, 26, 54.86) },
    ],
    dasha: {
      source: 'docs/reference/surya-siddhanta-makaranda/fixtures.md#displayed-vimshottari-mahadashas-1',
      review: {
        mahadasha: 'Opus review',
        antardashaAndPratyantardasha: 'pending',
      },
      seed: 'moon_janma_tara',
      division: 'D1',
      firstNakshatra: 'Krittika',
      firstNakshatraLord: 'Sun',
      direction: 'zodiacal_forward',
      yearBasis: 'true_sidereal_solar_revolution',
    },
    mahadasha: [
      md('Mercury', '1982-10-07T19:08:58+05:30', '1999-10-08T04:43:16+05:30'),
      md('Ketu', '1999-10-08T04:43:16+05:30', '2006-10-08T00:11:30+05:30'),
      md('Venus', MOJO_VENUS_MD_START, '2026-10-08T04:23:35+05:30'),
      md('Sun', '2026-10-08T04:23:35+05:30', '2032-10-07T17:39:13+05:30'),
      md('Moon', '2032-10-07T17:39:13+05:30', '2042-10-08T07:45:16+05:30'),
      md('Mars', '2042-10-08T07:45:16+05:30', '2049-10-08T03:13:30+05:30'),
      md('Rahu', '2049-10-08T03:13:30+05:30', '2067-10-08T19:00:23+05:30'),
      md('Jupiter', '2067-10-08T19:00:23+05:30', '2083-10-08T22:22:03+05:30'),
      md('Saturn', '2083-10-08T22:22:03+05:30', '2102-10-09T20:21:33+05:30'),
    ],
    antardasha: [
      ad(MOJO_VENUS_MD_ID, 'Venus', MOJO_VENUS_MD_START, '2010-02-03T04:42:31+05:30'),
      ad(MOJO_VENUS_MD_ID, 'Sun', '2010-02-03T04:42:31+05:30', '2011-02-03T10:55:07+05:30'),
      ad(MOJO_VENUS_MD_ID, 'Moon', '2011-02-03T10:55:07+05:30', '2012-10-07T13:27:07+05:30'),
      ad(MOJO_VENUS_MD_ID, 'Mars', '2012-10-07T13:27:07+05:30', '2013-12-06T11:47:43+05:30'),
      ad(MOJO_VENUS_MD_ID, 'Rahu', '2013-12-06T11:47:43+05:30', '2016-12-06T06:25:54+05:30'),
      ad(MOJO_VENUS_MD_ID, 'Jupiter', '2016-12-06T06:25:54+05:30', '2019-08-07T13:03:15+05:30'),
      ad(MOJO_VENUS_MD_ID, 'Saturn', '2019-08-07T13:03:15+05:30', '2022-10-08T03:33:10+05:30'),
      ad(MOJO_VENUS_MD_ID, 'Mercury', '2022-10-08T03:33:10+05:30', MOJO_VENUS_KETU_AD_START),
      ad(MOJO_VENUS_MD_ID, 'Ketu', MOJO_VENUS_KETU_AD_START, '2026-10-08T04:23:35+05:30'),
    ],
    pratyantardasha: [
      pd(MOJO_VENUS_KETU_AD_ID, 'Ketu', MOJO_VENUS_KETU_AD_START, '2025-09-01T14:36:33+05:30'),
      pd(MOJO_VENUS_KETU_AD_ID, 'Venus', '2025-09-01T14:36:33+05:30', '2025-11-11T10:50:56+05:30'),
      pd(MOJO_VENUS_KETU_AD_ID, 'Sun', '2025-11-11T10:50:56+05:30', '2025-12-02T04:13:49+05:30'),
      pd(MOJO_VENUS_KETU_AD_ID, 'Moon', '2025-12-02T04:13:49+05:30', '2026-01-05T10:38:02+05:30'),
      pd(MOJO_VENUS_KETU_AD_ID, 'Mars', '2026-01-05T10:38:02+05:30', '2026-01-29T10:12:09+05:30'),
      pd(MOJO_VENUS_KETU_AD_ID, 'Rahu', '2026-01-29T10:12:09+05:30', '2026-04-02T03:07:18+05:30'),
      pd(MOJO_VENUS_KETU_AD_ID, 'Jupiter', '2026-04-02T03:07:18+05:30', '2026-05-29T21:12:48+05:30'),
      pd(MOJO_VENUS_KETU_AD_ID, 'Saturn', '2026-05-29T21:12:48+05:30', '2026-08-07T21:05:33+05:30'),
      pd(MOJO_VENUS_KETU_AD_ID, 'Mercury', '2026-08-07T21:05:33+05:30', '2026-10-08T04:23:35+05:30'),
    ],
  },
] as const
