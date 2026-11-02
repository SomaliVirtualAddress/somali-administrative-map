import type {
  AreaGeometry,
  AreaStyleProps,
  Bbox,
  Layers,
  LegendClass,
  ListRow,
  MapLabel,
  MapPin,
  MapScene,
  RegionMetric,
  Selection,
  SomaliaData,
  ThemeName,
} from "@/lib/somalia/types"
import type { Feature, FeatureCollection } from "geojson"

const RAMP = ["#DCEEEA", "#B3D9D2", "#7FBDB2", "#3F9385", "#00695C"]

const PALETTE = {
  light: {
    muted: "#E8EEEC",
    stroke: "#7F9591",
    outline: "#4F6A65",
    focus: "#123A35",
  },
  dark: {
    muted: "#26332F",
    stroke: "#0E1A18",
    outline: "#6E8A84",
    focus: "#F2FBF9",
  },
} satisfies Record<ThemeName, Record<string, string>>

// Geography around Somalia, shown only when there is no street basemap.
const CONTEXT_LABELS: MapLabel[] = [
  {
    id: "ctx-ethiopia",
    text: "Ethiopia",
    lng: 42.6,
    lat: 6.6,
    kind: "context",
  },
  { id: "ctx-kenya", text: "Kenya", lng: 39.9, lat: 1.4, kind: "context" },
  {
    id: "ctx-djibouti",
    text: "Djibouti",
    lng: 42.2,
    lat: 11.75,
    kind: "context",
  },
  { id: "ctx-aden", text: "Gulf of Aden", lng: 47, lat: 12.4, kind: "context" },
  { id: "ctx-ocean", text: "Indian Ocean", lng: 50, lat: 4.2, kind: "context" },
]

const formatNumber = new Intl.NumberFormat("en")

export function formatArea(km2: number) {
  return `${formatNumber.format(km2)} km²`
}

function compact(value: number) {
  if (value < 1000) return String(value)
  const thousands = value / 1000
  return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`
}

function buildScale(values: number[], format: (value: number) => string) {
  const sorted = [...values].sort((a, b) => a - b)
  const cuts = [sorted[0]]
  for (let step = 1; step < 5; step++) {
    const cut = sorted[Math.floor((sorted.length * step) / 5)]
    if (cut > cuts[cuts.length - 1]) cuts.push(cut)
  }
  const colorAt = (index: number) =>
    cuts.length === 1
      ? RAMP[2]
      : RAMP[Math.round((index * (RAMP.length - 1)) / (cuts.length - 1))]
  const classOf = (value: number) => {
    let index = 0
    while (index + 1 < cuts.length && value >= cuts[index + 1]) index++
    return index
  }
  const legend: LegendClass[] = cuts.map((cut, index) => {
    const members = sorted.filter((value) => classOf(value) === index)
    const low = members[0] ?? cut
    const high = members[members.length - 1] ?? cut
    return {
      label: low === high ? format(low) : `${format(low)}–${format(high)}`,
      color: colorAt(index),
    }
  })
  return { legend, colorOf: (value: number) => colorAt(classOf(value)) }
}

function collection<P>(
  features: Feature<AreaGeometry, P>[]
): FeatureCollection<AreaGeometry, P> {
  return { type: "FeatureCollection", features }
}

export function buildScene(
  data: SomaliaData,
  selection: Selection,
  metric: RegionMetric,
  layers: Layers,
  theme: ThemeName
): MapScene {
  const colors = PALETTE[theme]
  const region = data.regions.find(
    (r) => r.properties.pcode === selection.regionPcode
  )
  const district = data.districts.find(
    (d) => d.properties.pcode === selection.districtPcode
  )

  const areas: Feature<AreaGeometry, AreaStyleProps>[] = []
  let labels: MapLabel[]
  let rows: ListRow[]
  let legend: LegendClass[]
  let legendTitle: string
  let bounds: Bbox = data.country.properties.bbox

  if (!region) {
    const useCounts = metric === "districts"
    const valueOf = (props: SomaliaData["regions"][number]["properties"]) =>
      useCounts ? props.districtCount : props.areaKm2
    const scale = buildScale(
      data.regions.map((r) => valueOf(r.properties)),
      useCounts ? String : compact
    )
    legend = scale.legend
    legendTitle = useCounts ? "Districts per region" : "Region area, km²"

    for (const { geometry, properties: p } of data.regions) {
      areas.push({
        type: "Feature",
        geometry,
        properties: {
          pcode: p.pcode,
          name: p.name,
          subtitle: `Region with ${p.districtCount} districts, ${formatArea(p.areaKm2)}`,
          targetPcode: p.pcode,
          fill: scale.colorOf(valueOf(p)),
          fillOpacity: layers.basemap ? 0.55 : 0.95,
          stroke: colors.stroke,
          strokeWidth: 1,
        },
      })
    }
    // Banadir is too small to hold a name at this zoom. Its pin and list row remain.
    const labelled = data.regions.filter((r) => r.properties.name !== "Banadir")
    labels = labelled.map(({ properties: p }) => ({
      id: p.pcode,
      text: p.name,
      lng: p.labelLng,
      lat: p.labelLat,
      kind: "area",
    }))
    rows = data.regions.map(({ properties: p }) => ({
      pcode: p.pcode,
      name: p.name,
      valueLabel: useCounts ? String(p.districtCount) : formatArea(p.areaKm2),
      color: scale.colorOf(valueOf(p)),
      hatched: data.districts.some(
        (d) => d.properties.regionPcode === p.pcode && d.properties.hatched
      ),
      selected: false,
    }))
  } else {
    const children = data.districts.filter(
      (d) => d.properties.regionPcode === region.properties.pcode
    )
    const scale = buildScale(
      children.map((d) => d.properties.areaKm2),
      compact
    )
    legend = scale.legend
    legendTitle = "District area, km²"
    bounds = district?.properties.bbox ?? region.properties.bbox

    for (const { geometry, properties: p } of data.regions) {
      if (p.pcode === region.properties.pcode) continue
      areas.push({
        type: "Feature",
        geometry,
        properties: {
          pcode: p.pcode,
          name: p.name,
          subtitle: `Open ${p.name} region`,
          targetPcode: p.pcode,
          fill: colors.muted,
          fillOpacity: layers.basemap ? 0.35 : 1,
          stroke: colors.stroke,
          strokeWidth: 0.75,
        },
      })
    }
    for (const { geometry, properties: p } of children) {
      const isSelected = p.pcode === district?.properties.pcode
      areas.push({
        type: "Feature",
        geometry,
        properties: {
          pcode: p.pcode,
          name: p.name,
          subtitle: `District of ${p.regionName}, ${formatArea(p.areaKm2)}`,
          targetPcode: p.pcode,
          fill: scale.colorOf(p.areaKm2),
          fillOpacity:
            (!district || isSelected ? 0.95 : 0.5) *
            (layers.basemap ? 0.55 : 1),
          stroke: isSelected ? colors.focus : colors.stroke,
          strokeWidth: isSelected ? 2.5 : 1,
        },
      })
    }
    // Draw the selected district last so its heavier border stays on top.
    areas.sort((a, b) => a.properties.strokeWidth - b.properties.strokeWidth)

    labels = children.map(({ properties: p }) => ({
      id: p.pcode,
      text: p.name,
      lng: p.labelLng,
      lat: p.labelLat,
      kind: p.pcode === district?.properties.pcode ? "selected" : "area",
    }))
    rows = children.map(({ properties: p }) => ({
      pcode: p.pcode,
      name: p.name,
      valueLabel: formatArea(p.areaKm2),
      color: scale.colorOf(p.areaKm2),
      hatched: p.hatched,
      selected: p.pcode === district?.properties.pcode,
    }))
  }

  if (!layers.labels) labels = []
  else if (!layers.basemap) labels = [...CONTEXT_LABELS, ...labels]

  const pins: MapPin[] = !layers.capitals
    ? []
    : data.capitals
        .filter(
          ({ properties: p }) =>
            !region || p.regionPcode === region.properties.pcode
        )
        .map(({ geometry, properties: p }) => ({
          id: p.regionPcode,
          name: p.name,
          subtitle: p.national
            ? `National capital, in ${p.regionName}`
            : `Capital of ${p.regionName}`,
          targetPcode: p.districtPcode,
          lng: geometry.coordinates[0],
          lat: geometry.coordinates[1],
        }))

  const hatched = data.districts.filter(
    (d) =>
      d.properties.hatched &&
      (!region || d.properties.regionPcode === region.properties.pcode)
  )

  return {
    fitKey: district?.properties.pcode ?? region?.properties.pcode ?? "SO",
    bounds,
    areas: collection(areas),
    hatch: collection(layers.hatching ? hatched : []),
    outline: collection([data.country]),
    labels,
    pins,
    legendTitle,
    legend,
    rows,
    theme,
    showHatching: layers.hatching && hatched.length > 0,
  }
}

/**
 * One seamless 16px tile of diagonal stripes, shared by every renderer. The
 * stripes sit on pale fills in both themes, so they stay dark in both.
 */
export function createHatchTile() {
  const size = 16
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")!
  context.strokeStyle = "rgba(10, 40, 36, 0.55)"
  context.lineWidth = 1.5
  context.beginPath()
  for (const offset of [-size, 0, size]) {
    context.moveTo(offset, size)
    context.lineTo(offset + size, 0)
  }
  context.stroke()
  return canvas
}

export const OUTLINE_COLOR = {
  light: PALETTE.light.outline,
  dark: PALETTE.dark.outline,
}

export const FOCUS_COLOR = {
  light: PALETTE.light.focus,
  dark: PALETTE.dark.focus,
}
