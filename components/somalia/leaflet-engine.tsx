"use client"

import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useEffect, useMemo, useRef, useState } from "react"

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
import type { Feature } from "geojson"

const toLatLngBounds = ([w, s, e, n]: Bbox) => L.latLngBounds([s, w], [n, e])

const FIT_OPTIONS: L.FitBoundsOptions = {
  paddingTopLeft: [FIT_PADDING.left, FIT_PADDING.top],
  paddingBottomRight: [FIT_PADDING.right, FIT_PADDING.bottom],
}

// CARTO's raster tiles now require an API key. OpenStreetMap's are free for light
// use: https://operations.osmfoundation.org/policies/tiles/
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Registers the hatch tile as an SVG pattern that paths can use as a fill. */
function installHatchPattern(renderer: L.SVG) {
  const svg = (renderer as unknown as { _container: SVGSVGElement })._container
  const namespace = "http://www.w3.org/2000/svg"
  const defs = document.createElementNS(namespace, "defs")
  const pattern = document.createElementNS(namespace, "pattern")
  pattern.setAttribute("id", "somalia-hatch")
  pattern.setAttribute("patternUnits", "userSpaceOnUse")
  pattern.setAttribute("width", "8")
  pattern.setAttribute("height", "8")
  const image = document.createElementNS(namespace, "image")
  image.setAttribute("href", createHatchTile().toDataURL())
  image.setAttribute("width", "8")
  image.setAttribute("height", "8")
  pattern.append(image)
  defs.append(pattern)
  svg.prepend(defs)
}

export default function LeafletEngine({
  scene,
  basemap,
  highlightPcode,
  initialCamera,
  handleRef,
  onSelect,
  onHover,
  onCameraChange,
}: MapEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<{ map: L.Map; renderer: L.SVG } | null>(
    null
  )
  const [hovered, setHovered] = useState<string | null>(null)
  const active = hovered ?? highlightPcode

  const callbacks = useRef({ onSelect, onHover, onCameraChange })
  useEffect(() => {
    callbacks.current = { onSelect, onHover, onCameraChange }
  }, [onSelect, onHover, onCameraChange])

  useEffect(() => {
    const renderer = L.svg({ padding: 0.5 })
    const map = L.map(containerRef.current!, {
      zoomControl: false,
      attributionControl: true,
      renderer,
      zoomSnap: 0,
      ...CAMERA_LIMITS,
    })
    map.attributionControl.setPrefix(false)
    if (initialCamera) {
      map.setView([initialCamera.lat, initialCamera.lng], initialCamera.zoom, {
        animate: false,
      })
    } else {
      map.fitBounds(toLatLngBounds(scene.bounds), {
        ...FIT_OPTIONS,
        animate: false,
      })
    }

    const report = () => {
      const center = map.getCenter()
      callbacks.current.onCameraChange({
        lng: center.lng,
        lat: center.lat,
        zoom: map.getZoom(),
      })
    }
    report()
    map.on("move zoomend", report)
    renderer.addTo(map)
    installHatchPattern(renderer)
    setEngine({ map, renderer })

    // Leaflet only notices window resizes, not the sidebar opening or closing.
    const resizeObserver = new ResizeObserver(() =>
      map.invalidateSize({ animate: false })
    )
    resizeObserver.observe(containerRef.current!)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      setEngine(null)
    }
    // The camera only seeds the first render; later moves come from the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const adapter = useMemo<CameraAdapter | null>(() => {
    if (!engine) return null
    const { map } = engine
    // Held here because a fade can finish after the map has been removed.
    const { overlayPane } = map.getPanes()
    return {
      getCamera: () => {
        const { lng, lat } = map.getCenter()
        return { lng, lat, zoom: map.getZoom() }
      },
      jumpTo: ({ lng, lat, zoom }) =>
        map.setView([lat, lng], zoom, { animate: false }),
      getSize: () => {
        const { x, y } = map.getSize()
        return { width: x, height: y }
      },
      getContainer: () => map.getContainer(),
      setAreaOpacity: (opacity) => {
        overlayPane.style.opacity = String(opacity)
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
      unproject: (x, y) => map.containerPointToLatLng([x, y]),
    }
  }, [engine])

  useEffect(() => {
    if (!engine || !basemap) return
    const tiles = L.tileLayer(TILES, {
      attribution: TILE_ATTRIBUTION,
      className: "somalia-tiles",
      referrerPolicy: "strict-origin-when-cross-origin",
      maxZoom: 19,
    }).addTo(engine.map)
    return () => {
      tiles.remove()
    }
  }, [engine, basemap])

  // Layers are added in paint order and rebuilt whenever the scene changes.
  useEffect(() => {
    if (!engine) return
    const { map, renderer } = engine

    const areas = L.geoJSON(scene.areas, {
      renderer,
      style: (feature) => {
        const p = feature!.properties as AreaStyleProps
        return {
          fillColor: p.fill,
          fillOpacity: p.fillOpacity,
          color: p.stroke,
          weight: p.strokeWidth,
          opacity: 1,
        }
      },
      onEachFeature: (feature: Feature, layer) => {
        const p = feature.properties as AreaStyleProps
        layer.on({
          mouseover: () => {
            setHovered(p.pcode)
            callbacks.current.onHover({ title: p.name, subtitle: p.subtitle })
          },
          mouseout: () => {
            setHovered((current) => (current === p.pcode ? null : current))
            callbacks.current.onHover(null)
          },
          click: () => callbacks.current.onSelect(p.targetPcode),
        })
      },
    } as L.GeoJSONOptions).addTo(map)

    const hatch = L.geoJSON(scene.hatch, {
      renderer,
      interactive: false,
      stroke: false,
      fillColor: "url(#somalia-hatch)",
      fillOpacity: 1,
    } as L.GeoJSONOptions).addTo(map)

    const outline = L.geoJSON(scene.outline, {
      renderer,
      interactive: false,
      fill: false,
      color: OUTLINE_COLOR[scene.theme],
      weight: 1.25,
    } as L.GeoJSONOptions).addTo(map)

    return () => {
      areas.remove()
      hatch.remove()
      outline.remove()
    }
  }, [engine, scene.areas, scene.hatch, scene.outline, scene.theme])

  useEffect(() => {
    if (!engine || !active) return
    const hover = L.geoJSON(
      {
        ...scene.areas,
        features: scene.areas.features.filter(
          (f) => f.properties.pcode === active
        ),
      } as GeoJSON.FeatureCollection,
      {
        renderer: engine.renderer,
        interactive: false,
        fill: false,
        color: FOCUS_COLOR[scene.theme],
        weight: 2,
      } as L.GeoJSONOptions
    ).addTo(engine.map)
    return () => {
      hover.remove()
    }
  }, [engine, active, scene.areas, scene.theme])

  useEffect(() => {
    if (!engine) return
    const group = L.layerGroup().addTo(engine.map)
    for (const label of scene.labels) {
      const span = document.createElement("span")
      span.className = "map-label"
      span.dataset.kind = label.kind
      span.textContent = label.text
      L.marker([label.lat, label.lng], {
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: "map-label-leaflet",
          html: span,
          iconSize: [0, 0],
        }),
      }).addTo(group)
    }
    for (const pin of scene.pins) {
      L.marker([pin.lat, pin.lng], {
        keyboard: false,
        title: "",
        icon: L.divIcon({
          className: "map-pin-leaflet",
          html: PIN_SVG,
          iconSize: [20, 29],
          iconAnchor: [10, 24],
        }),
      })
        .on({
          click: () => callbacks.current.onSelect(pin.targetPcode),
          mouseover: () =>
            callbacks.current.onHover({
              title: pin.name,
              subtitle: pin.subtitle,
            }),
          mouseout: () => callbacks.current.onHover(null),
        })
        .addTo(group)
    }
    return () => {
      group.remove()
    }
  }, [engine, scene.labels, scene.pins])

  useEngineCamera(adapter, scene, handleRef)

  return <div ref={containerRef} className="somalia-leaflet absolute inset-0" />
}
