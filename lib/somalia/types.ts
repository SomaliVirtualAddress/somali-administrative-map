import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson"

export type Bbox = [number, number, number, number]
export type AreaGeometry = Polygon | MultiPolygon

type BaseProps = {
  pcode: string
  name: string
  areaKm2: number
  bbox: Bbox
}

export type CountryProps = BaseProps

export type RegionProps = BaseProps & {
  districtCount: number
  labelLng: number
  labelLat: number
}

export type DistrictProps = BaseProps & {
  regionPcode: string
  regionName: string
  hatched: boolean
  labelLng: number
  labelLat: number
}

export type CapitalProps = {
  name: string
  regionPcode: string
  regionName: string
  districtPcode: string
  national: boolean
}

export type CountryFeature = Feature<AreaGeometry, CountryProps>
export type RegionFeature = Feature<AreaGeometry, RegionProps>
export type DistrictFeature = Feature<AreaGeometry, DistrictProps>
export type CapitalFeature = Feature<Point, CapitalProps>

export type SomaliaData = {
  country: CountryFeature
  regions: RegionFeature[]
  districts: DistrictFeature[]
  capitals: CapitalFeature[]
}

export type Selection = {
  regionPcode: string | null
  districtPcode: string | null
}

export type RegionMetric = "districts" | "area"
export type EngineName = "mapcn" | "leaflet"
export type ThemeName = "light" | "dark"

export type Layers = {
  labels: boolean
  capitals: boolean
  hatching: boolean
  basemap: boolean
  animation: boolean
}

export type AreaStyleProps = {
  pcode: string
  name: string
  subtitle: string
  targetPcode: string
  fill: string
  fillOpacity: number
  stroke: string
  strokeWidth: number
}

export type MapLabel = {
  id: string
  text: string
  lng: number
  lat: number
  kind: "area" | "selected" | "context"
}

export type MapPin = {
  id: string
  name: string
  subtitle: string
  targetPcode: string
  lng: number
  lat: number
}

export type LegendClass = { label: string; color: string }

export type ListRow = {
  pcode: string
  name: string
  valueLabel: string
  color: string
  hatched: boolean
  selected: boolean
}

export type MapScene = {
  fitKey: string
  bounds: Bbox
  areas: FeatureCollection<AreaGeometry, AreaStyleProps>
  hatch: FeatureCollection<AreaGeometry>
  outline: FeatureCollection<AreaGeometry>
  labels: MapLabel[]
  pins: MapPin[]
  legendTitle: string
  legend: LegendClass[]
  rows: ListRow[]
  theme: ThemeName
  showHatching: boolean
}
