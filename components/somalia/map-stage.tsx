"use client"

import {
  Download,
  Layers as LayersIcon,
  Minus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScanSearch,
  Sun,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import dynamic from "next/dynamic"
import { Component, useRef, type ReactNode } from "react"

import type { MapEngineHandle } from "@/components/somalia/engine-types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { renderMapPng } from "@/lib/somalia/export-png"
import {
  cameraStore,
  hoverStore,
  pointerStore,
  useStore,
} from "@/lib/somalia/pointer-store"
import type {
  EngineName,
  Layers,
  MapScene,
  RegionMetric,
} from "@/lib/somalia/types"

const EngineLoading = () => (
  <Skeleton className="absolute inset-0 rounded-none" />
)

const MapLibreEngine = dynamic(
  () => import("@/components/somalia/maplibre-engine"),
  {
    ssr: false,
    loading: EngineLoading,
  }
)
const LeafletEngine = dynamic(
  () => import("@/components/somalia/leaflet-engine"),
  {
    ssr: false,
    loading: EngineLoading,
  }
)

class EngineBoundary extends Component<
  { onFallback: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <p>
          This browser can&apos;t run the mapcn engine because WebGL is off.
        </p>
        <Button onClick={this.props.onFallback}>Switch to Leaflet</Button>
      </div>
    )
  }
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

// Close in, a district is one flat colour, so offer the streets underneath.
const STREETS_PROMPT_ZOOM = 11.5

function StreetsPrompt({ onShow }: { onShow: () => void }) {
  const camera = useStore(cameraStore)
  const isClose = (camera?.zoom ?? 0) >= STREETS_PROMPT_ZOOM
  return (
    <AnimatePresence>
      {isClose && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto bg-background shadow-sm"
            onClick={onShow}
          >
            Show streets
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function HoverTooltip() {
  const hover = useStore(hoverStore)
  const pointer = useStore(pointerStore)
  if (!hover || !pointer) return null
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-60 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md"
      style={{ left: pointer.x + 14, top: pointer.y + 14 }}
    >
      <p className="font-semibold">{hover.title}</p>
      <p className="opacity-80">{hover.subtitle}</p>
    </div>
  )
}

const NICE_DISTANCES = [
  0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000,
]

function ScaleAndPosition() {
  const camera = useStore(cameraStore)
  const pointer = useStore(pointerStore)
  if (!camera) return null

  const kmPerPixel =
    (156.54303 * Math.cos((camera.lat * Math.PI) / 180)) / 2 ** camera.zoom
  const distance =
    NICE_DISTANCES.findLast((km) => km / kmPerPixel <= 96) ?? NICE_DISTANCES[0]
  const hemisphere = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(3)}° ${value >= 0 ? positive : negative}`

  return (
    <div className="flex flex-col items-end gap-1 text-[11px] text-muted-foreground tabular-nums">
      {pointer && (
        <span className="hidden sm:inline">
          {hemisphere(pointer.lat, "N", "S")},{" "}
          {hemisphere(pointer.lng, "E", "W")}
        </span>
      )}
      <span
        className="flex justify-center border-x border-b border-muted-foreground whitespace-nowrap"
        style={{ width: distance / kmPerPixel }}
      >
        {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance} km`}
      </span>
    </div>
  )
}

const SELECTED_TOGGLE =
  "data-pressed:bg-primary data-pressed:text-primary-foreground data-pressed:hover:bg-primary"

const LAYER_OPTIONS: { key: keyof Layers; label: string }[] = [
  { key: "labels", label: "Place names" },
  { key: "capitals", label: "Region capitals" },
  { key: "hatching", label: "Contested areas" },
  { key: "basemap", label: "Street basemap" },
  { key: "animation", label: "Map animation" },
]

export function MapStage({
  scene,
  title,
  isCountry,
  engine,
  layers,
  metric,
  highlightPcode,
  onEngineChange,
  onLayersChange,
  onMetricChange,
  onSelect,
  onToggleTheme,
  panelOpen,
  onTogglePanel,
}: {
  scene: MapScene
  title: string
  isCountry: boolean
  engine: EngineName
  layers: Layers
  metric: RegionMetric
  highlightPcode: string | null
  onEngineChange: (engine: EngineName) => void
  onLayersChange: (layers: Layers) => void
  onMetricChange: (metric: RegionMetric) => void
  onSelect: (pcode: string) => void
  onToggleTheme: () => void
  panelOpen: boolean
  onTogglePanel: () => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<MapEngineHandle>(null)

  const exportPng = async () => {
    const stage = stageRef.current
    const handle = handleRef.current
    if (!stage || !handle) return
    const blob = await renderMapPng(
      scene,
      handle.getBounds(),
      stage.clientWidth,
      stage.clientHeight,
      title
    )
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-map.png`
    link.click()
    // Revoking straight away can cancel the download before it starts.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const Engine = engine === "mapcn" ? MapLibreEngine : LeafletEngine

  return (
    <div
      ref={stageRef}
      className="relative isolate min-h-0 flex-1 overflow-hidden"
      onPointerMove={(event) => {
        const handle = handleRef.current
        if (!handle) return
        const box = event.currentTarget.getBoundingClientRect()
        const x = event.clientX - box.left
        const y = event.clientY - box.top
        pointerStore.set({ x, y, ...handle.unproject(x, y) })
      }}
      onPointerLeave={() => {
        pointerStore.set(null)
        hoverStore.set(null)
      }}
    >
      {/* Grabbing or scrolling the map takes over from a camera flight. */}
      <div
        className="absolute inset-0 z-0"
        onPointerDownCapture={() => handleRef.current?.stopCamera()}
        onWheelCapture={() => handleRef.current?.stopCamera()}
      >
        <motion.div
          key={engine}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
        >
          <EngineBoundary onFallback={() => onEngineChange("leaflet")}>
            <Engine
              scene={scene}
              basemap={layers.basemap}
              highlightPcode={highlightPcode}
              initialCamera={cameraStore.get()}
              handleRef={handleRef}
              onSelect={onSelect}
              onHover={hoverStore.set}
              onCameraChange={cameraStore.set}
            />
          </EngineBoundary>
        </motion.div>
      </div>

      <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={panelOpen ? "Hide sidebar" : "Show sidebar"}
                  aria-expanded={panelOpen}
                  className="bg-background shadow-sm"
                  onClick={onTogglePanel}
                />
              }
            >
              {panelOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {panelOpen ? "Hide sidebar" : "Show sidebar"}
            </TooltipContent>
          </Tooltip>
          <ToggleGroup
            aria-label="Map engine"
            variant="outline"
            size="sm"
            spacing={0}
            value={[engine]}
            onValueChange={(values: string[]) => {
              if (values[0]) onEngineChange(values[0] as EngineName)
            }}
            className="bg-background shadow-sm"
          >
            <ToggleGroupItem value="mapcn" className={SELECTED_TOGGLE}>
              mapcn
            </ToggleGroupItem>
            <ToggleGroupItem value="leaflet" className={SELECTED_TOGGLE}>
              Leaflet
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <AnimatePresence initial={false}>
          {isCountry && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              <ToggleGroup
                aria-label="Shade regions by"
                variant="outline"
                size="sm"
                spacing={0}
                value={[metric]}
                onValueChange={(values: string[]) => {
                  if (values[0]) onMetricChange(values[0] as RegionMetric)
                }}
                className="bg-background shadow-sm"
              >
                <ToggleGroupItem value="districts" className={SELECTED_TOGGLE}>
                  Districts
                </ToggleGroupItem>
                <ToggleGroupItem value="area" className={SELECTED_TOGGLE}>
                  Area
                </ToggleGroupItem>
              </ToggleGroup>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute top-3 right-3 z-10 flex flex-col rounded-lg border bg-background shadow-sm">
        <ControlButton
          label="Zoom in"
          onClick={() => handleRef.current?.zoomBy(1)}
        >
          <Plus />
        </ControlButton>
        <ControlButton
          label="Zoom out"
          onClick={() => handleRef.current?.zoomBy(-1)}
        >
          <Minus />
        </ControlButton>
        <ControlButton
          label="Fit to view"
          onClick={() => handleRef.current?.fitScene()}
        >
          <ScanSearch />
        </ControlButton>
        <ControlButton label="Download as PNG" onClick={exportPng}>
          <Download />
        </ControlButton>
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Map layers" />
            }
          >
            <LayersIcon />
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-56">
            {LAYER_OPTIONS.map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3"
              >
                <Label htmlFor={`layer-${key}`}>{label}</Label>
                <Switch
                  id={`layer-${key}`}
                  checked={layers[key]}
                  onCheckedChange={(checked: boolean) =>
                    onLayersChange({ ...layers, [key]: checked })
                  }
                />
              </div>
            ))}
          </PopoverContent>
        </Popover>
        <ControlButton label="Switch light or dark" onClick={onToggleTheme}>
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </ControlButton>
      </div>

      <div className="absolute bottom-3 left-3 z-10 flex w-64 max-w-[calc(100%-1.5rem)] flex-col rounded-lg border bg-background/95 p-2.5 text-xs shadow-sm">
        <motion.p
          key={scene.legendTitle}
          className="font-semibold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {scene.legendTitle}
        </motion.p>
        <ul className="mt-1.5 flex">
          {scene.legend.map((item, index) => (
            <motion.li
              key={index}
              layout="position"
              className="min-w-0 flex-1"
              transition={{ duration: 0.3 }}
            >
              <motion.span
                className="block h-2.5"
                initial={false}
                animate={{ backgroundColor: item.color }}
                transition={{ duration: 0.4 }}
              />
              <span className="mt-0.5 block text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
                {item.label}
              </span>
            </motion.li>
          ))}
        </ul>
        <AnimatePresence initial={false}>
          {scene.showHatching && (
            <motion.p
              className="overflow-hidden text-muted-foreground"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <span className="flex items-center gap-1.5 pt-1.5">
                <span className="hatch-swatch size-3 shrink-0 rounded-[2px] border" />
                Contested administration
              </span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="pointer-events-none absolute right-3 bottom-8 z-10">
        <ScaleAndPosition />
      </div>

      {!layers.basemap && (
        <StreetsPrompt
          onShow={() => onLayersChange({ ...layers, basemap: true })}
        />
      )}

      <HoverTooltip />
    </div>
  )
}
