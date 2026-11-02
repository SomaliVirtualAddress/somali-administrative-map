import { animate, stagger, type AnimationPlaybackControls } from "motion"

import type { Camera } from "@/lib/somalia/pointer-store"
import type { Bbox } from "@/lib/somalia/types"

const TILE_SIZE = 256
const EASE_IN_OUT: [number, number, number, number] = [0.45, 0, 0.15, 1]

// Set from the "Map animation" switch. It deliberately doesn't follow the
// operating system's reduced motion setting, so the switch is the only way off.
let animationEnabled = true

export function setMapAnimation(enabled: boolean) {
  animationEnabled = enabled
}

// Web Mercator, normalised so the whole world spans 0 to 1.
const toWorldX = (lng: number) => (lng + 180) / 360
const toWorldY = (lat: number) =>
  (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2
const fromWorldX = (x: number) => x * 360 - 180
const fromWorldY = (y: number) =>
  (Math.atan(Math.exp((1 - 2 * y) * Math.PI)) * 360) / Math.PI - 90

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export type CameraLimits = { minZoom: number; maxZoom: number }
export type Padding = {
  top: number
  right: number
  bottom: number
  left: number
}

/** The camera that fits a box in the viewport, the same for every engine. */
export function cameraForBounds(
  [west, south, east, north]: Bbox,
  size: { width: number; height: number },
  padding: Padding,
  limits: CameraLimits
): Camera {
  const x0 = toWorldX(west)
  const x1 = toWorldX(east)
  const y0 = toWorldY(north)
  const y1 = toWorldY(south)
  const usableWidth = Math.max(1, size.width - padding.left - padding.right)
  const usableHeight = Math.max(1, size.height - padding.top - padding.bottom)
  const zoom = clamp(
    Math.log2(
      Math.min(usableWidth / (x1 - x0), usableHeight / (y1 - y0)) / TILE_SIZE
    ),
    limits.minZoom,
    limits.maxZoom
  )
  const worldPixels = TILE_SIZE * 2 ** zoom
  const offsetX = (padding.right - padding.left) / 2 / worldPixels
  const offsetY = (padding.bottom - padding.top) / 2 / worldPixels
  return {
    lng: fromWorldX((x0 + x1) / 2 + offsetX),
    lat: fromWorldY((y0 + y1) / 2 + offsetY),
    zoom,
  }
}

export type CameraFlight = { stop: () => void; duration: number }

/**
 * Flies between two cameras. When the target is already in view the zoom keeps
 * it on a straight path. When it is further away the camera pulls back first,
 * then comes in again.
 */
export function flyCamera(
  from: Camera,
  to: Camera,
  options: {
    width: number
    minZoom: number
    duration?: number
    onFrame: (camera: Camera) => void
    onComplete?: () => void
  }
): CameraFlight {
  const { width, minZoom, onFrame, onComplete } = options
  if (!animationEnabled) {
    onFrame(to)
    onComplete?.()
    return { stop: () => {}, duration: 0 }
  }

  const x0 = toWorldX(from.lng)
  const y0 = toWorldY(from.lat)
  const dx = toWorldX(to.lng) - x0
  const dy = toWorldY(to.lat) - y0
  const zoomChange = to.zoom - from.zoom

  const distance =
    Math.hypot(dx, dy) * TILE_SIZE * 2 ** Math.min(from.zoom, to.zoom)
  const reach = width * 0.6
  // A sideways move between neighbours gets a small pull-back too, so it reads
  // as zooming out and in rather than sliding across.
  const isSideways = Math.abs(zoomChange) < 1 && distance > width * 0.15
  const pullBack =
    distance > reach
      ? Math.min(Math.log2(distance / reach), 2.5)
      : isSideways
        ? 0.7
        : 0
  const followsZoom = pullBack === 0 && Math.abs(zoomChange) > 0.01

  const duration =
    options.duration ??
    clamp(1 + 0.2 * (Math.abs(zoomChange) + pullBack), 1, 2.2)

  // A stopped flight must never touch the camera again, because stopping is how
  // a flight ends when its engine, and so its map, is being removed.
  let stopped = false
  const controls: AnimationPlaybackControls = animate(0, 1, {
    duration,
    ease: EASE_IN_OUT,
    onUpdate: (progress) => {
      if (stopped) return
      const zoom =
        from.zoom +
        zoomChange * progress -
        pullBack * Math.sin(Math.PI * progress)
      const travelled = followsZoom
        ? (1 - 2 ** (-zoomChange * progress)) / (1 - 2 ** -zoomChange)
        : progress
      onFrame({
        lng: fromWorldX(x0 + dx * travelled),
        lat: fromWorldY(y0 + dy * travelled),
        zoom: Math.max(minZoom, zoom),
      })
    },
    onComplete: () => {
      if (stopped) return
      onFrame(to)
      onComplete?.()
    },
  })

  return {
    stop: () => {
      stopped = true
      controls.stop()
    },
    duration,
  }
}

/** Brings in the labels and pins of a new view as the camera arrives. */
export function revealMarkers(container: HTMLElement, startDelay: number) {
  if (!animationEnabled) return

  const labels = [...container.querySelectorAll<HTMLElement>(".map-label")]
  const pins = [
    ...container.querySelectorAll<SVGElement>(
      ".map-pin svg, .map-pin-leaflet svg"
    ),
  ]
  for (const element of [...labels, ...pins]) element.style.opacity = "0"

  if (labels.length > 0) {
    animate(
      labels,
      // Explicit keyframes: some labels survive between views, and Motion would
      // skip a plain target of 1 because it last left them at 1.
      { opacity: [0, 1] },
      { duration: 0.35, delay: stagger(0.015, { startDelay }) }
    )
  }
  if (pins.length > 0) {
    animate(
      pins,
      { opacity: [0, 1], y: [-14, 0] },
      {
        type: "spring",
        bounce: 0.35,
        duration: 0.55,
        delay: stagger(0.02, { startDelay }),
      }
    )
  }
}

/** Eases the newly drawn shapes in while the camera moves. */
export function revealAreas(onFrame: (opacity: number) => void) {
  if (!animationEnabled) return () => {}
  const controls = animate(0.5, 1, {
    duration: 0.6,
    ease: "easeOut",
    onUpdate: onFrame,
  })
  return () => {
    controls.stop()
    onFrame(1)
  }
}
