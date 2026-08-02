/**
 * SectionUnavailable — shared "data unavailable" message + client error boundary.
 *
 * One reusable mechanism for R8: any pane whose data is absent, malformed, or throws
 * unexpectedly degrades to the same fixed message, naming only the section — never an
 * exception type, stack trace or field path (R8.4).
 */
'use client'

import { Component, type ReactNode } from 'react'

export interface SectionUnavailableProps {
  /** Human-readable name of the unavailable section, e.g. "Nakshatras". */
  section: string
}

/** Renders exactly: "{section} data is unavailable for this chart." */
export function SectionUnavailable({ section }: SectionUnavailableProps) {
  return (
    <p role="status">
      {section} data is unavailable for this chart.
    </p>
  )
}

export interface SectionBoundaryProps {
  /** Human-readable name of the guarded section, passed through to SectionUnavailable. */
  section: string
  children: ReactNode
}

interface SectionBoundaryState {
  failed: boolean
}

/**
 * Client error boundary: an unexpected throw inside `children` degrades to the same
 * SectionUnavailable message rather than crashing the rest of the page. No exception
 * type, stack or field path is ever surfaced.
 */
export class SectionBoundary extends Component<SectionBoundaryProps, SectionBoundaryState> {
  state: SectionBoundaryState = { failed: false }

  static getDerivedStateFromError(): SectionBoundaryState {
    return { failed: true }
  }

  componentDidCatch(): void {
    // Intentionally no logging of the error/stack here — R8.4 forbids surfacing it,
    // and this component has no telemetry sink of its own to send it to instead.
  }

  render() {
    if (this.state.failed) {
      return <SectionUnavailable section={this.props.section} />
    }
    return this.props.children
  }
}
