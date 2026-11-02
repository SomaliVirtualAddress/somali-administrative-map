"use client"

import { motion, MotionConfig } from "motion/react"
import { useTheme } from "next-themes"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { GazetteerPanel } from "@/components/somalia/gazetteer-panel"
import { MapStage } from "@/components/somalia/map-stage"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { setMapAnimation } from "@/lib/somalia/camera-motion"
import { loadSomaliaData } from "@/lib/somalia/data"
import { buildScene } from "@/lib/somalia/scene"
import type {
  EngineName,
  Layers,
  RegionMetric,
  Selection,
  SomaliaData,
} from "@/lib/somalia/types"

const ANIMATION_KEY = "somalia-map-animation"
const DESKTOP_QUERY = "(min-width: 768px)"

// Only runs in the browser, because Explorer waits for the fetched boundaries.
function readSavedAnimation() {
  try {
    return localStorage.getItem(ANIMATION_KEY) !== "false"
  } catch {
    return true
  }
}

// Reads the live URL, because React's copy can lag just behind a click.
function buildUrl(changes: { selection?: Selection; engine?: EngineName }) {
  const params = new URLSearchParams(window.location.search)
  if (changes.selection) {
    params.delete("region")
    params.delete("district")
    const { regionPcode, districtPcode } = changes.selection
    if (regionPcode) params.set("region", regionPcode)
    if (districtPcode) params.set("district", districtPcode)
  }
  if (changes.engine === "mapcn") params.delete("engine")
  else if (changes.engine) params.set("engine", changes.engine)
  const query = params.toString()
  return query ? `?${query}` : window.location.pathname
}

function ExplorerSkeleton() {
  return (
    <div className="flex h-svh flex-col-reverse md:flex-row">
      <Skeleton className="h-[42svh] w-full rounded-none md:h-svh md:w-88" />
      <Skeleton className="flex-1 rounded-none opacity-60" />
    </div>
  )
}

export function SomaliaExplorer() {
  const [data, setData] = useState<SomaliaData | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadSomaliaData()
      .then((loaded) => {
        if (!cancelled) setData(loaded)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (failed) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <p>The boundary files in public/data could not be loaded.</p>
        <Button
          onClick={() => {
            setFailed(false)
            setAttempt((count) => count + 1)
          }}
        >
          Load again
        </Button>
      </div>
    )
  }
  if (!data) return <ExplorerSkeleton />
  return <Explorer data={data} />
}

function Explorer({ data }: { data: SomaliaData }) {
  const params = useSearchParams()
  const { resolvedTheme, setTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"

  const [panelOpen, setPanelOpen] = useState(true)
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches
  )
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const update = () => setIsDesktop(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  const [metric, setMetric] = useState<RegionMetric>("districts")
  const [highlightPcode, setHighlightPcode] = useState<string | null>(null)
  const [layers, setLayers] = useState<Layers>({
    labels: true,
    capitals: true,
    hatching: true,
    basemap: false,
    animation: readSavedAnimation(),
  })

  useEffect(() => {
    setMapAnimation(layers.animation)
    try {
      localStorage.setItem(ANIMATION_KEY, String(layers.animation))
    } catch {
      // Without storage the switch still works until the page reloads.
    }
  }, [layers.animation])

  // The URL holds the selection, so views can be linked and the back button works.
  const engine: EngineName =
    params.get("engine") === "leaflet" ? "leaflet" : "mapcn"
  const selection = useMemo<Selection>(() => {
    const district = data.districts.find(
      (d) => d.properties.pcode === params.get("district")
    )
    const region = data.regions.find(
      (r) =>
        r.properties.pcode ===
        (district?.properties.regionPcode ?? params.get("region"))
    )
    return {
      regionPcode: region?.properties.pcode ?? null,
      districtPcode: district?.properties.pcode ?? null,
    }
  }, [data, params])

  const navigate = useCallback(
    (pcode: string | null) => {
      const next: Selection = { regionPcode: null, districtPcode: null }
      const district = data.districts.find((d) => d.properties.pcode === pcode)
      if (district) {
        next.regionPcode = district.properties.regionPcode
        next.districtPcode = district.properties.pcode
      } else if (data.regions.some((r) => r.properties.pcode === pcode)) {
        next.regionPcode = pcode
      }
      setHighlightPcode(null)
      window.history.pushState(null, "", buildUrl({ selection: next }))
    },
    [data]
  )

  const changeEngine = useCallback((next: EngineName) => {
    window.history.replaceState(null, "", buildUrl({ engine: next }))
  }, [])

  useEffect(() => {
    const goUp = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (selection.districtPcode) navigate(selection.regionPcode)
      else if (selection.regionPcode) navigate(null)
    }
    window.addEventListener("keydown", goUp)
    return () => window.removeEventListener("keydown", goUp)
  }, [navigate, selection])

  const scene = useMemo(
    () => buildScene(data, selection, metric, layers, theme),
    [data, selection, metric, layers, theme]
  )

  const title =
    data.districts.find((d) => d.properties.pcode === selection.districtPcode)
      ?.properties.name ??
    data.regions.find((r) => r.properties.pcode === selection.regionPcode)
      ?.properties.name ??
    data.country.properties.name

  return (
    <MotionConfig reducedMotion={layers.animation ? "never" : "always"}>
      <main className="flex h-svh flex-col-reverse overflow-hidden md:flex-row">
        <motion.div
          className="shrink-0 overflow-hidden"
          initial={false}
          animate={
            isDesktop
              ? { width: panelOpen ? 352 : 0 }
              : { height: panelOpen ? "auto" : 0 }
          }
          transition={{ duration: 0.3, ease: "easeInOut" }}
          inert={!panelOpen}
        >
          <GazetteerPanel
            data={data}
            scene={scene}
            selection={selection}
            onNavigate={navigate}
            onHighlight={setHighlightPcode}
          />
        </motion.div>
        <MapStage
          scene={scene}
          title={title}
          isCountry={!selection.regionPcode}
          engine={engine}
          layers={layers}
          metric={metric}
          highlightPcode={highlightPcode}
          onEngineChange={changeEngine}
          onLayersChange={setLayers}
          onMetricChange={setMetric}
          onSelect={navigate}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((open) => !open)}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        />
      </main>
    </MotionConfig>
  )
}
