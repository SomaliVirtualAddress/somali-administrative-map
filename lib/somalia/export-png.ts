import {
  createHatchTile,
  FOCUS_COLOR,
  OUTLINE_COLOR,
} from "@/lib/somalia/scene"
import type { AreaGeometry, Bbox, MapScene } from "@/lib/somalia/types"

const mercatorY = (lat: number) =>
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

/**
 * Draws the current view from the scene itself, so both engines export the same
 * image. Street basemap tiles are left out.
 */
export function renderMapPng(
  scene: MapScene,
  view: Bbox,
  width: number,
  height: number,
  title: string
) {
  const scale = 2
  const canvas = document.createElement("canvas")
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext("2d")!
  ctx.scale(scale, scale)

  const dark = scene.theme === "dark"
  const ink = dark ? "#F2FBF9" : "#123A35"
  const halo = dark ? "#16211F" : "#FAFDFC"
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, width, height)

  const [west, south, east, north] = view
  const top = mercatorY(north)
  const bottom = mercatorY(south)
  const x = (lng: number) => ((lng - west) / (east - west)) * width
  const y = (lat: number) => ((top - mercatorY(lat)) / (top - bottom)) * height

  const trace = (geometry: AreaGeometry) => {
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates
    ctx.beginPath()
    for (const polygon of polygons) {
      for (const ring of polygon) {
        ring.forEach(([lng, lat], index) =>
          index === 0 ? ctx.moveTo(x(lng), y(lat)) : ctx.lineTo(x(lng), y(lat))
        )
        ctx.closePath()
      }
    }
  }

  for (const { geometry, properties: p } of scene.areas.features) {
    trace(geometry)
    ctx.globalAlpha = p.fillOpacity
    ctx.fillStyle = p.fill
    ctx.fill("evenodd")
    ctx.globalAlpha = 1
    ctx.strokeStyle = p.stroke
    ctx.lineWidth = p.strokeWidth
    ctx.stroke()
  }

  const stripes = ctx.createPattern(createHatchTile(), "repeat")
  if (stripes) {
    for (const { geometry } of scene.hatch.features) {
      trace(geometry)
      ctx.fillStyle = stripes
      ctx.fill("evenodd")
    }
  }

  for (const { geometry } of scene.outline.features) {
    trace(geometry)
    ctx.strokeStyle = OUTLINE_COLOR[scene.theme]
    ctx.lineWidth = 1.25
    ctx.stroke()
  }

  for (const pin of scene.pins) {
    const px = x(pin.lng)
    const py = y(pin.lat)
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.bezierCurveTo(px - 2, py - 6, px - 7, py - 9, px - 7, py - 15)
    ctx.arc(px, py - 15, 7, Math.PI, 0)
    ctx.bezierCurveTo(px + 7, py - 9, px + 2, py - 6, px, py)
    ctx.fillStyle = "#C8102E"
    ctx.fill()
    ctx.beginPath()
    ctx.arc(px, py - 15, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = "#FFFFFF"
    ctx.fill()
  }

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.lineJoin = "round"
  for (const label of scene.labels) {
    const context = label.kind === "context"
    ctx.font = `${context ? "italic 400" : label.kind === "selected" ? "700" : "600"} 12px "Public Sans", sans-serif`
    const lines = context ? [label.text] : label.text.split(" ")
    lines.forEach((line, index) => {
      const lineY = y(label.lat) + (index - (lines.length - 1) / 2) * 13
      ctx.strokeStyle = halo
      ctx.lineWidth = 3
      ctx.strokeText(line, x(label.lng), lineY)
      ctx.fillStyle = context ? `${ink}99` : ink
      ctx.fillText(line, x(label.lng), lineY)
    })
  }

  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = FOCUS_COLOR[scene.theme]
  ctx.font = '700 20px "Public Sans", sans-serif'
  ctx.fillText(title, 20, 34)

  const swatch = 32
  const legendTop = height - 66
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.roundRect(
    10,
    legendTop - 18,
    20 + scene.legend.length * (swatch + 14),
    62,
    8
  )
  ctx.fill()
  ctx.font = '600 12px "Public Sans", sans-serif'
  ctx.fillStyle = ink
  ctx.fillText(scene.legendTitle, 20, legendTop)
  ctx.font = '400 10px "Public Sans", sans-serif'
  scene.legend.forEach((item, index) => {
    const left = 20 + index * (swatch + 14)
    ctx.fillStyle = item.color
    ctx.fillRect(left, legendTop + 8, swatch + 14, 10)
    ctx.fillStyle = ink
    ctx.fillText(item.label, left, legendTop + 31)
  })

  ctx.textAlign = "right"
  ctx.fillStyle = `${ink}B3`
  ctx.fillText(
    "Boundaries: OCHA COD-AB via HDX, CC BY-IGO",
    width - 16,
    height - 14
  )

  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  )
}
