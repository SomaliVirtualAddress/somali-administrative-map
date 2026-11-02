"use client"

import { useEffect, useMemo, useState } from "react"

import {
  Map,
  MapGeoJSON,
  MapMarker,
  MarkerContent,
  useMap,
  type MapGeoJSONEvent,
} from "@/components/ui/map"
import {
  CAMERA_LIMITS,
  FIT_PADDING,
  PIN_SVG,
  type MapEngineProps,
} from "@/components/somalia/engine-types"
import {
  useEngineCamera,
  type CameraAdapter,
} from "@/components/somalia/use-engine-camera"
import {
  createHatchTile,
  FOCUS_COLOR,
  OUTLINE_COLOR,
} from "@/lib/somalia/scene"
import type { AreaStyleProps, Bbox } from "@/lib/somalia/types"

const HATCH_IMAGE = "somalia-hatch"
const HATCH_PAINT = { "fill-pattern": HATCH_IMAGE }

const toLngLatBounds = ([w, s, e, n]: Bbox): [
  [number, number],
  [number, number],
] => [
  [w, s],
  [e, n],
]

function EngineBridge({
  scene,
  basemap,
  handleRef,
  onCameraChange,
}: Pick<MapEngineProps, "scene" | "basemap" | "handleRef" | "onCameraChange">) {
  const { map } = useMap()

  const adapter = useMemo<CameraAdapter | null>(() => {
    if (!map) return null
    // Held here because a fade can finish after the map has been removed.
    const canvas = map.getCanvas()
    return {
      getCamera: () => {
        const { lng, lat } = map.getCenter()
        return { lng, lat, zoom: map.getZoom() + 1 }
      },
      jumpTo: ({ lng, lat, zoom }) =>
        map.jumpTo({ center: [lng, lat], zoom: zoom - 1 }),
      getSize: () => ({
        width: map.getContainer().clientWidth,
        height: map.getContainer().clientHeight,
      }),
      getContainer: () => map.getContainer(),
      // Tiles share this canvas, so only the plain view can fade.
      setAreaOpacity: (opacity) => {
        if (!basemap) canvas.style.opacity = String(opacity)
      },
      getBounds: () => {
        const bounds = map.getBounds()
        return [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ]
      },
      unproject: (x, y) => map.unproject([x, y]),
    }
  }, [map, basemap])

  useEngineCamera(adapter, scene, handleRef)

  useEffect(() => {
    if (!map) return
    const report = () => {
      const { lng, lat } = map.getCenter()
      onCameraChange({ lng, lat, zoom: map.getZoom() + 1 })
    }
    report()
    map.on("move", report)
    return () => {
      map.off("move", report)
    }
  }, [map, onCameraChange])

  // Style images are dropped whenever the basemap style reloads.
  useEffect(() => {
    if (!map) return
    map.setMissingStyleImageResolver((id) => {
      if (id !== HATCH_IMAGE || map.hasImage(id)) return
      const tile = createHatchTile()
      const pixels = tile
        .getContext("2d")!
        .getImageData(0, 0, tile.width, tile.height)
      map.addImage(id, pixels, { pixelRatio: 2 })
    })
  }, [map])

  return null
}

export default function MapLibreEngine({
  scene,
  basemap,
  highlightPcode,
  initialCamera,
  handleRef,
  onSelect,
  onHover,
  onCameraChange,
}: MapEngineProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const active = hovered ?? highlightPcode

  const hoverData = useMemo(
    () => ({
      ...scene.areas,
      features: scene.areas.features.filter(
        (f) => f.properties.pcode === active
      ),
    }),
    [scene.areas, active]
  )

  const handleHover = (event: MapGeoJSONEvent<AreaStyleProps> | null) => {
    const props = event?.feature.properties
    setHovered(props?.pcode ?? null)
    onHover(props ? { title: props.name, subtitle: props.subtitle } : null)
  }

  const fillPaint = useMemo(
    () => ({
      "fill-color": ["get", "fill"],
      "fill-opacity": ["get", "fillOpacity"],
    }),
    []
  )
  const linePaint = useMemo(
    () => ({
      "line-color": ["get", "stroke"],
      "line-width": ["get", "strokeWidth"],
    }),
    []
  )
  const outlinePaint = useMemo(
    () => ({ "line-color": OUTLINE_COLOR[scene.theme], "line-width": 1.25 }),
    [scene.theme]
  )
  const hoverPaint = useMemo(
    () => ({ "line-color": FOCUS_COLOR[scene.theme], "line-width": 2 }),
    [scene.theme]
  )

  return (
    <Map
      blank={!basemap}
      theme={scene.theme}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      minZoom={CAMERA_LIMITS.minZoom - 1}
      maxZoom={CAMERA_LIMITS.maxZoom - 1}
      {...(initialCamera
        ? {
            center: [initialCamera.lng, initialCamera.lat] as [number, number],
            zoom: initialCamera.zoom - 1,
          }
        : {
            bounds: toLngLatBounds(scene.bounds),
            fitBoundsOptions: { padding: FIT_PADDING },
          })}
    >
      <MapGeoJSON<AreaStyleProps>
        id="areas"
        data={scene.areas}
        promoteId="pcode"
        interactive
        fillPaint={fillPaint as never}
        linePaint={linePaint as never}
        onHover={handleHover}
        onClick={(event) => onSelect(event.feature.properties.targetPcode)}
      />
      <MapGeoJSON
        id="hatch"
        data={scene.hatch}
        fillPaint={HATCH_PAINT}
        linePaint={false}
      />
      <MapGeoJSON
        id="outline"
        data={scene.outline}
        fillPaint={false}
        linePaint={outlinePaint}
      />
      <MapGeoJSON
        id="hover"
        data={hoverData}
        fillPaint={false}
        linePaint={hoverPaint}
      />

      {scene.pins.map((pin) => (
        <MapMarker
          key={pin.id}
          longitude={pin.lng}
          latitude={pin.lat}
          anchor="bottom"
          offset={[0, 5]}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(pin.targetPcode)
          }}
          onMouseEnter={() =>
            onHover({ title: pin.name, subtitle: pin.subtitle })
          }
          onMouseLeave={() => onHover(null)}
        >
          <MarkerContent>
            <span
              className="map-pin block"
              dangerouslySetInnerHTML={{ __html: PIN_SVG }}
            />
          </MarkerContent>
        </MapMarker>
      ))}
      {scene.labels.map((label) => (
        <MapMarker key={label.id} longitude={label.lng} latitude={label.lat}>
          <MarkerContent className="map-label-wrap">
            <span className="map-label" data-kind={label.kind}>
              {label.text}
            </span>
          </MarkerContent>
        </MapMarker>
      ))}
      {/* Last, so its effects run once the markers above are on the map. */}
      <EngineBridge
        scene={scene}
        basemap={basemap}
        handleRef={handleRef}
        onCameraChange={onCameraChange}
      />
    </Map>
  )
}
