import type { RefObject } from "react"

import type { Camera, HoverInfo } from "@/lib/somalia/pointer-store"
import type { Bbox, MapScene } from "@/lib/somalia/types"

/** What the shared controls can ask of whichever engine is mounted. */
export type MapEngineHandle = {
  zoomBy: (delta: number) => void
  fitScene: () => void
  stopCamera: () => void
  getBounds: () => Bbox
  unproject: (x: number, y: number) => { lng: number; lat: number }
}

/**
 * Every map engine takes these same props. `Camera.zoom` uses Leaflet's 256px
 * tile scale, so MapLibre subtracts one when reading it.
 */
export type MapEngineProps = {
  scene: MapScene
  basemap: boolean
  highlightPcode: string | null
  initialCamera: Camera | null
  handleRef: RefObject<MapEngineHandle | null>
  onSelect: (pcode: string) => void
  onHover: (info: HoverInfo | null) => void
  onCameraChange: (camera: Camera) => void
}

// On Leaflet's zoom scale, like Camera.zoom.
export const CAMERA_LIMITS = { minZoom: 4, maxZoom: 19 }

// Keeps fitted shapes clear of the control stack and the legend.
export const FIT_PADDING = { top: 32, right: 56, bottom: 112, left: 32 }

export const PIN_SVG = `<svg width="20" height="29" viewBox="0 0 26 38" aria-hidden="true"><ellipse cx="13" cy="31" rx="9" ry="5" fill="#C8102E" opacity=".28"/><path d="M13 31C9 23 3 19 3 12a10 10 0 0 1 20 0c0 7-6 11-10 19Z" fill="#C8102E" stroke="#fff" stroke-width="1.25"/><circle cx="13" cy="12" r="3.5" fill="#fff"/></svg>`
