/**
 * GrahasTable — the merged Grahas tab (R3): one row per graha, replacing the
 * former Planets / Nakshatras / Karakas tabs.
 *
 * Column set is the superset described in design.md ("R3 — GrahasTable"):
 * Graha, Sign, Degree, House, R, Dignity (D1), Nakshatra, Pada, Nak Lord,
 * Sub Lord, Deg in Nak, Karaka, Speed, Longitude — 14 columns. The karaka
 * cell is a disclosure (button + sr-only description + hover/focus popover),
 * not a 15th column, and the rank `#` / duplicate `Degree` columns the old
 * KarakaTable carried are deliberately not repeated here.
 *
 * Props are typed against the real engine shapes (`@/engine/compute/types`)
 * rather than hand-rolled duplicates: `NakshatraInfo` already carries
 * `subLord`, and `CharaKaraka` already carries the karaka's full name
 * (`karaka`) alongside its abbreviation (`karakaAbbr`), so no separate
 * `KARAKA_SHORT` abbreviation→full-name map is needed — only the
 * `KARAKA_DESCRIPTIONS` signification map, lifted from the (to be deleted,
 * task 15.2) `KarakaTable.tsx`, is required for the disclosure text.
 *
 * Spec: .kiro/specs/chart-ui-enhancements/
 */
'use client'

import type {
  PlanetPosition,
  NakshatraInfo,
  CharaKaraka,
  DivisionalChart,
} from '@/engine/compute/types'
import { planetColorClass } from '@/lib/brandColors'
import { SectionUnavailable } from './SectionUnavailable'
import { guardSection, isNonEmptyArray } from './sectionGuards'

export interface GrahasTableProps {
  planets: PlanetPosition[]
  nakshatras?: NakshatraInfo[]
  charaKarakas?: CharaKaraka[]
  /** D1 supplies the dignity column. */
  divisionalCharts?: DivisionalChart[]
  lagna: string
}

/** d°mm'ss" degree-in-sign formatter, lifted verbatim from PlanetTable.tsx. */
function formatDMS(decimalDeg: number): string {
  const deg = Math.floor(decimalDeg)
  const minFloat = (decimalDeg - deg) * 60
  const min = Math.floor(minFloat)
  const sec = Math.round((minFloat - min) * 60)
  return `${deg}°${min.toString().padStart(2, '0')}'${sec.toString().padStart(2, '0')}"`
}

/**
 * Karaka abbreviation -> signification text. Moved in from KarakaTable.tsx
 * (deleted in task 15.2) verbatim; this is the text the karaka cell's
 * disclosure now carries instead of a dedicated table column (R3.5).
 */
const KARAKA_DESCRIPTIONS: Record<string, string> = {
  AK: 'Self, Soul — the planet representing the native',
  AmK: 'Career, Minister — professional life and associates',
  BK: 'Siblings, Courage — brothers, valor, co-borns',
  MK: 'Mother, Property — maternal figure, land, vehicles',
  PK: 'Children, Education — progeny, intelligence, creativity',
  GK: 'Enemies, Obstacles — illness, debts, opposition',
  DK: 'Spouse, Partnership — marriage partner, business partner',
  PiK: 'Father, Guru — paternal figure, spiritual teacher',
}

/**
 * The karaka cell: a `<button type="button" aria-describedby>` naming the
 * abbreviation, a visually-hidden sibling `<span>` carrying the full
 * signification sentence, and a popover mirroring the same text on `:hover`
 * and `:focus-visible` via Tailwind's `peer` variants — reachable by
 * keyboard, not hover-only (R3.5, mirroring KeyDignitiesPanel's chip pattern
 * from design.md).
 */
function KarakaCell({ entry }: { entry: CharaKaraka | undefined }) {
  if (!entry) return <td className="px-3 py-2 text-center" />

  const sigId = `karaka-sig-${entry.planet}`
  const description = KARAKA_DESCRIPTIONS[entry.karakaAbbr]
  const fullText = description ? `${entry.karaka} — ${description}` : entry.karaka

  return (
    <td className="px-3 py-2 text-center">
      <span className="relative inline-block">
        <button
          type="button"
          aria-describedby={sigId}
          className="peer font-medium text-ink underline decoration-dotted decoration-gray-500"
        >
          {entry.karakaAbbr}
        </button>
        <span id={sigId} className="sr-only">
          {fullText}
        </span>
        <span
          role="presentation"
          className="invisible absolute left-1/2 top-full z-10 mt-1 w-56 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-left text-xs font-normal normal-case text-popover-foreground shadow-md peer-hover:visible peer-focus-visible:visible"
        >
          {fullText}
        </span>
      </span>
    </td>
  )
}

export default function GrahasTable({
  planets,
  nakshatras,
  charaKarakas,
  divisionalCharts,
  lagna,
}: GrahasTableProps) {
  // Root-prop guard (R8.1): `planets` is the one prop every row is built from,
  // so an absent / null / wrongly-typed value makes the whole pane a single
  // unavailable section rather than a throw. Every other prop already degrades
  // to empty cells plus a naming message below (R3.8).
  const grahaRows = guardSection<PlanetPosition[]>(planets, isNonEmptyArray)
  if (!grahaRows.ok) return <SectionUnavailable section="Grahas" />

  const d1Chart = Array.isArray(divisionalCharts)
    ? divisionalCharts.find((d) => d.division === 1)
    : undefined

  // Section-level availability (R3.8): the whole Nakshatra / Chara Karaka
  // section is "unavailable" only when the array is absent/empty or matches
  // none of chart.planets. An individual graha legitimately lacking a karaka
  // (Rahu/Ketu) or a nakshatra match is NOT that case — it just gets an
  // empty cell in that row (R3.4), no section message.
  const grahas = grahaRows.data
  const nakshatrasAvailable =
    isNonEmptyArray<NakshatraInfo>(nakshatras) &&
    nakshatras.some((n) => grahas.some((p) => p.planet === n.planet))
  const karakasAvailable =
    isNonEmptyArray<CharaKaraka>(charaKarakas) &&
    charaKarakas.some((k) => grahas.some((p) => p.planet === k.planet))

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700 space-y-1">
        <h3 className="text-sm font-semibold">Grahas</h3>
        <p className="text-xs text-gray-500">Lagna: {lagna} | Sidereal (Lahiri Ayanamsa)</p>
        {/* R4.1 legend — static text, no hover/click/expansion. */}
        <p className="text-xs text-gray-500">
          Graha text colour identifies the graha only — it carries no strength or dignity meaning.
        </p>
      </div>

      {!nakshatrasAvailable && (
        <div className="px-4 py-2 border-b border-gray-800 text-xs">
          <SectionUnavailable section="Nakshatras" />
        </div>
      )}
      {!karakasAvailable && (
        <div className="px-4 py-2 border-b border-gray-800 text-xs">
          <SectionUnavailable section="Chara Karakas" />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Graha positions, D1 dignity, nakshatra and chara karaka assignments
          </caption>
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-700">
              <th scope="col" className="px-3 py-2 text-left">Graha</th>
              <th scope="col" className="px-3 py-2 text-left">Sign</th>
              <th scope="col" className="px-3 py-2 text-right">Degree</th>
              <th scope="col" className="px-3 py-2 text-center">House</th>
              <th scope="col" className="px-3 py-2 text-center">R</th>
              <th scope="col" className="px-3 py-2 text-left">Dignity (D1)</th>
              <th scope="col" className="px-3 py-2 text-left">Nakshatra</th>
              <th scope="col" className="px-3 py-2 text-center">Pada</th>
              <th scope="col" className="px-3 py-2 text-left">Nak Lord</th>
              <th scope="col" className="px-3 py-2 text-left">Sub Lord</th>
              <th scope="col" className="px-3 py-2 text-right">Deg in Nak</th>
              <th scope="col" className="px-3 py-2 text-center">Karaka</th>
              <th scope="col" className="px-3 py-2 text-right">Speed</th>
              <th scope="col" className="px-3 py-2 text-right">Longitude</th>
            </tr>
          </thead>
          <tbody>
            {grahas.map((p) => {
              const nak = nakshatrasAvailable
                ? nakshatras?.find((n) => n.planet === p.planet)
                : undefined
              const karaka = karakasAvailable
                ? charaKarakas?.find((k) => k.planet === p.planet)
                : undefined
              const d1Placement = d1Chart?.planets.find((dp) => dp.planet === p.planet)

              return (
                <tr key={p.planet} className="border-b border-gray-800 hover:bg-gray-800/30">
                  <th
                    scope="row"
                    className={`px-3 py-2 text-left font-medium ${planetColorClass(p.planet)}`}
                  >
                    {p.planet}
                  </th>
                  <td className="px-3 py-2 text-gray-300">{p.sign}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-300">
                    {formatDMS(p.degreeInSign)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-700 text-xs font-medium">
                      {p.house}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.retrograde && <span className="text-amber-400 font-bold text-xs">R</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-300">{d1Placement?.dignity ?? ''}</td>
                  <td className="px-3 py-2 text-gray-300">{nak?.nakshatra ?? ''}</td>
                  <td className="px-3 py-2 text-center">
                    {nak ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-700 text-xs font-medium">
                        {nak.pada}
                      </span>
                    ) : null}
                  </td>
                  <td className={`px-3 py-2 ${nak ? planetColorClass(nak.nakshatraLord) : 'text-gray-300'}`}>
                    {nak?.nakshatraLord ?? ''}
                  </td>
                  <td className={`px-3 py-2 ${nak ? planetColorClass(nak.subLord) : 'text-gray-300'}`}>
                    {nak?.subLord ?? ''}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">
                    {nak ? `${nak.degreeInNakshatra.toFixed(2)}°` : ''}
                  </td>
                  <KarakaCell entry={karaka} />
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">
                    {p.speed.toFixed(4)}°/d
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">
                    {p.longitude.toFixed(4)}°
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
