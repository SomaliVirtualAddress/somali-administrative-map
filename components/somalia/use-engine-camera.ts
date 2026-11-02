"use client"

import { useEffect, useImperativeHandle, useRef, type RefObject } from "react"

import {
  CAMERA_LIMITS,
  FIT_PADDING,
  type MapEngineHandle,
} from "@/components/somalia/engine-types"
import {
  cameraForBounds,
  flyCamera,
  revealAreas,
  revealMarkers,
  type CameraFlight,
} from "@/lib/somalia/camera-motion"
import type { Camera } from "@/lib/somalia/pointer-store"
import type { Bbox, MapScene } from "@/lib/somalia/types"

/** The few things an engine must do for Motion to move its camera. */
export type CameraAdapter = {
  getCamera: () => Camera
  jumpTo: (camera: Camera) => void
  getSize: () => { width: number; height: number }
  getContainer: () => HTMLElement
  setAreaOpacity: (opacity: number) => void
  getBounds: () => Bbox
  unproject: (x: number, y: number) => { lng: number; lat: number }
}

const ZOOM_BUTTON_SECONDS = 0.4

/**
 * Runs every camera move for an engine, so a click, the zoom buttons and fit to
 * view all move the same way on mapcn and Leaflet. Call it after the effects
 * that build the engine's markers, so the reveal can find the new ones.
 */
export function useEngineCamera(
  adapter: CameraAdapter | null,
  scene: MapScene,
  handleRef: RefObject<MapEngineHandle | null>
) {
  const flight = useRef<CameraFlight | null>(null)
  const zoomTarget = useRef<number | null>(null)
  const lastFitKey = useRef(scene.fitKey)

  useImperativeHandle(handleRef, () => {
    const stopCamera = () => {
      flight.current?.stop()
      flight.current = null
      zoomTarget.current = null
    }
    const flyTo = (to: Camera, duration?: number) => {
      if (!adapter) return
      flight.current?.stop()
      flight.current = flyCamera(adapter.getCamera(), to, {
        width: adapter.getSize().width,
        minZoom: CAMERA_LIMITS.minZoom,
        duration,
        onFrame: adapter.jumpTo,
        onComplete: () => {
          zoomTarget.current = null
        },
      })
    }
    return {
      stopCamera,
      // Quick repeat clicks build on where the last click was heading.
      zoomBy: (delta) => {
        if (!adapter) return
        const camera = adapter.getCamera()
        const zoom = Math.min(
          CAMERA_LIMITS.maxZoom,
          Math.max(
            CAMERA_LIMITS.minZoom,
            (zoomTarget.current ?? camera.zoom) + delta
          )
        )
        zoomTarget.current = zoom
        flyTo({ ...camera, zoom }, ZOOM_BUTTON_SECONDS)
      },
      fitScene: () => {
        if (!adapter) return
        zoomTarget.current = null
        flyTo(
          cameraForBounds(
            scene.bounds,
            adapter.getSize(),
            FIT_PADDING,
            CAMERA_LIMITS
          )
        )
      },
      getBounds: () => adapter!.getBounds(),
      unproject: (x, y) => adapter!.unproject(x, y),
    }
  }, [adapter, scene.bounds])

  useEffect(() => {
    if (!adapter || lastFitKey.current === scene.fitKey) return
    lastFitKey.current = scene.fitKey
    zoomTarget.current = null
    flight.current?.stop()
    flight.current = flyCamera(
      adapter.getCamera(),
      cameraForBounds(
        scene.bounds,
        adapter.getSize(),
        FIT_PADDING,
        CAMERA_LIMITS
      ),
      {
        width: adapter.getSize().width,
        minZoom: CAMERA_LIMITS.minZoom,
        onFrame: adapter.jumpTo,
      }
    )
    revealMarkers(adapter.getContainer(), flight.current.duration * 0.55)
    return revealAreas(adapter.setAreaOpacity)
  }, [adapter, scene.fitKey, scene.bounds])

  useEffect(
    () => () => {
      flight.current?.stop()
    },
    []
  )
}
