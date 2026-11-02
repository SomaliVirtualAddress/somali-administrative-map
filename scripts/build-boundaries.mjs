// Builds the map data in public/data from the OCHA COD-AB archive for Somalia:
// https://data.humdata.org/dataset/cod-ab-som (som_admin_boundaries.geojson.zip)
//
//   node scripts/build-boundaries.mjs <path-to-extracted-archive>
//
// Boundaries are not simplified. Coordinates are only rounded, so regions and
// districts keep sharing exactly the same edges.
import fs from "node:fs"
import path from "node:path"

const source = process.argv[2]
if (!source) {
  console.error(
    "Usage: node scripts/build-boundaries.mjs <extracted-archive-dir>"
  )
  process.exit(1)
}
const output = path.join(import.meta.dirname, "..", "public", "data")
fs.mkdirSync(output, { recursive: true })

// HDX ships label centroids but no capitals, so these points are hand-curated.
// The build fails if a point does not fall inside its region.
const CAPITALS = [
  ["SO11", "Borama", 43.183, 9.936],
  ["SO12", "Hargeysa", 44.065, 9.56],
  ["SO13", "Burco", 45.534, 9.522],
  ["SO14", "Laas Caanood", 47.356, 8.476],
  ["SO15", "Ceerigaabo", 47.368, 10.617],
  ["SO16", "Bossaso", 49.182, 11.284],
  ["SO17", "Garoowe", 48.482, 8.407],
  ["SO18", "Gaalkacyo", 47.431, 6.769],
  ["SO19", "Dhuusamarreeb", 46.386, 5.535],
  ["SO20", "Belet Weyne", 45.204, 4.736],
  ["SO21", "Jowhar", 45.501, 2.782],
  ["SO22", "Mogadishu", 45.318, 2.046],
  ["SO23", "Marka", 44.77, 1.715],
  ["SO24", "Baydhaba", 43.65, 3.114],
  ["SO25", "Xudur", 43.888, 4.121],
  ["SO26", "Garbahaarey", 42.221, 3.327],
  ["SO27", "Bu'aale", 42.58, 1.083],
  ["SO28", "Kismaayo", 42.545, -0.358],
]

// Editorial annotation, not part of the HDX data: the Sool, Sanaag and Cayn
// area, whose administration is contested. Change this list to change the
// hatching.
const HATCHED_REGIONS = new Set(["SO14", "SO15"])
const HATCHED_DISTRICT_NAMES = new Set(["Buuhoodle"])

const round = (value) => Math.round(value * 1e5) / 1e5

function roundCoordinates(coordinates) {
  if (typeof coordinates[0] === "number") return coordinates.map(round)
  const rounded = coordinates.map(roundCoordinates)
  if (typeof rounded[0]?.[0] !== "number") return rounded
  return rounded.filter(
    (point, i) =>
      i === 0 ||
      point[0] !== rounded[i - 1][0] ||
      point[1] !== rounded[i - 1][1]
  )
}

function bbox(geometry) {
  const box = [Infinity, Infinity, -Infinity, -Infinity]
  const visit = (coordinates) => {
    if (typeof coordinates[0] === "number") {
      box[0] = Math.min(box[0], coordinates[0])
      box[1] = Math.min(box[1], coordinates[1])
      box[2] = Math.max(box[2], coordinates[0])
      box[3] = Math.max(box[3], coordinates[1])
      return
    }
    coordinates.forEach(visit)
  }
  visit(geometry.coordinates)
  return box
}

function inRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

function contains(geometry, lng, lat) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  return polygons.some(
    ([outer, ...holes]) =>
      inRing(lng, lat, outer) && !holes.some((hole) => inRing(lng, lat, hole))
  )
}

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(source, name), "utf8")).features
}

function write(name, features) {
  const body = JSON.stringify({ type: "FeatureCollection", features })
  fs.writeFileSync(path.join(output, name), body)
  console.log(
    `${name}: ${features.length} features, ${Math.round(body.length / 1024)} KB`
  )
}

function toFeature(feature, properties) {
  const geometry = {
    type: feature.geometry.type,
    coordinates: roundCoordinates(feature.geometry.coordinates),
  }
  return {
    type: "Feature",
    properties: { ...properties, bbox: bbox(geometry) },
    geometry,
  }
}

const country = read("som_admin0.geojson").map((feature) =>
  toFeature(feature, {
    pcode: feature.properties.adm0_pcode,
    name: feature.properties.adm0_name,
    areaKm2: Math.round(feature.properties.area_sqkm),
  })
)

const rawDistricts = read("som_admin2.geojson")
const districts = rawDistricts.map((feature) => {
  const { adm2_pcode, adm2_name, adm1_pcode, adm1_name, area_sqkm } =
    feature.properties
  return toFeature(feature, {
    pcode: adm2_pcode,
    name: adm2_name,
    regionPcode: adm1_pcode,
    regionName: adm1_name,
    areaKm2: Math.round(area_sqkm),
    hatched:
      HATCHED_REGIONS.has(adm1_pcode) || HATCHED_DISTRICT_NAMES.has(adm2_name),
  })
})

for (const name of HATCHED_DISTRICT_NAMES) {
  if (!districts.some((district) => district.properties.name === name)) {
    throw new Error(`Hatched district not found in HDX data: ${name}`)
  }
}

const regions = read("som_admin1.geojson").map((feature) => {
  const { adm1_pcode, adm1_name, area_sqkm } = feature.properties
  return toFeature(feature, {
    pcode: adm1_pcode,
    name: adm1_name,
    areaKm2: Math.round(area_sqkm),
    districtCount: districts.filter(
      (d) => d.properties.regionPcode === adm1_pcode
    ).length,
    labelLng: round(feature.properties.center_lon),
    labelLat: round(feature.properties.center_lat),
  })
})

const capitals = CAPITALS.map(([regionPcode, name, lng, lat]) => {
  const region = regions.find((r) => r.properties.pcode === regionPcode)
  if (!region) throw new Error(`Unknown region ${regionPcode} for ${name}`)
  if (!contains(region.geometry, lng, lat)) {
    throw new Error(
      `${name} (${lng}, ${lat}) is outside ${region.properties.name}`
    )
  }
  const district = districts.find(
    (d) =>
      d.properties.regionPcode === regionPcode && contains(d.geometry, lng, lat)
  )
  if (!district)
    throw new Error(`${name} is not inside a district of its region`)
  console.log(
    `${region.properties.name}: ${name} is in ${district.properties.name}`
  )
  return {
    type: "Feature",
    properties: {
      name,
      regionPcode,
      regionName: region.properties.name,
      districtPcode: district.properties.pcode,
      national: name === "Mogadishu",
    },
    geometry: { type: "Point", coordinates: [lng, lat] },
  }
})

const districtLabels = new Map(
  rawDistricts.map((f) => [
    f.properties.adm2_pcode,
    [round(f.properties.center_lon), round(f.properties.center_lat)],
  ])
)
for (const district of districts) {
  const [labelLng, labelLat] = districtLabels.get(district.properties.pcode)
  Object.assign(district.properties, { labelLng, labelLat })
}

write("som_adm0.geojson", country)
write("som_adm1.geojson", regions)
write("som_adm2.geojson", districts)
write("som_capitals.geojson", capitals)
