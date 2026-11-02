import type { FeatureCollection, Geometry } from "geojson"

import type { SomaliaData } from "@/lib/somalia/types"

async function loadLayer<T>(name: string) {
  const response = await fetch(`/data/${name}.geojson`)
  if (!response.ok) {
    throw new Error(`${name} returned ${response.status}`)
  }
  const collection = (await response.json()) as FeatureCollection<Geometry>
  return collection.features as T[]
}

export async function loadSomaliaData(): Promise<SomaliaData> {
  const [country, regions, districts, capitals] = await Promise.all([
    loadLayer<SomaliaData["country"]>("som_adm0"),
    loadLayer<SomaliaData["regions"][number]>("som_adm1"),
    loadLayer<SomaliaData["districts"][number]>("som_adm2"),
    loadLayer<SomaliaData["capitals"][number]>("som_capitals"),
  ])
  const byName = <T extends { properties: { name: string } }>(a: T, b: T) =>
    a.properties.name.localeCompare(b.properties.name)

  return {
    country: country[0],
    regions: regions.sort(byName),
    districts: districts.sort(byName),
    capitals,
  }
}
