// Pointer and camera change on every frame. Keeping them in small stores lets
// the tooltip and scale bar update without re-rendering the map engines.
import { useSyncExternalStore } from "react"

function createStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      value = next
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type Camera = { lng: number; lat: number; zoom: number }
export type PointerState = { x: number; y: number; lng: number; lat: number }
export type HoverInfo = { title: string; subtitle: string }

export const cameraStore = createStore<Camera | null>(null)
export const pointerStore = createStore<PointerState | null>(null)
export const hoverStore = createStore<HoverInfo | null>(null)

export function useStore<T>(store: ReturnType<typeof createStore<T>>) {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
