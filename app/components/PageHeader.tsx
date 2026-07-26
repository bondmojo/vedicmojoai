/**
 * PageHeader — shared page title + optional subtitle block. Keeps heading
 * scale and spacing consistent across pages instead of each page picking
 * its own ad-hoc <h1> classes.
 */

export default function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )
}
