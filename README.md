# Somalia administrative map

Explore Somalia from country to region to district. The same map runs on two
engines, [mapcn](https://mapcn.dev) (MapLibre GL) and [Leaflet](https://leafletjs.com),
and you can switch between them at any time without losing your place.

```bash
pnpm install
pnpm dev
```

## How the two engines fit together

`lib/somalia/scene.ts` turns the selection into one engine-neutral `MapScene`
holding the shapes, colours, labels, pins and legend. Each engine only draws it:

- `components/somalia/maplibre-engine.tsx`
- `components/somalia/leaflet-engine.tsx`

Both take the same `MapEngineProps` and expose the same `MapEngineHandle`, both
defined in `components/somalia/engine-types.ts`. The controls, legend, tooltip,
scale bar and PNG export live outside the engines, so they behave the same on
either one.

Every camera move runs through [Motion](https://motion.dev):
`lib/somalia/camera-motion.ts` works out the path, and
`components/somalia/use-engine-camera.ts` plays it on whichever engine is mounted.
Dragging or scrolling the map stops a flight. Flights ignore the operating system's
reduced motion setting. To turn them off, use the Map animation switch in the Layers
menu, which is remembered in the browser.

Views can be linked: `?region=SO14`, `?district=SO1101`, `?engine=leaflet`.

## Data

Boundaries come from [OCHA COD-AB on HDX](https://data.humdata.org/dataset/cod-ab-som)
(version 3, valid from 8 January 2025, CC BY-IGO). To rebuild `public/data`, download
`som_admin_boundaries.geojson.zip`, extract it, then run:

```bash
node scripts/build-boundaries.mjs path/to/extracted-folder
```

Boundaries are not simplified, and coordinates are rounded to 5 decimal places.

Two things in `scripts/build-boundaries.mjs` are not from HDX, so check them before
publishing:

- **Region capitals** are hand-entered coordinates. The build fails if a point falls
  outside its region.
- **Contested-area hatching** covers Sool, Sanaag and Buuhoodle district. This is an
  editorial choice. Change `HATCHED_REGIONS` and `HATCHED_DISTRICT_NAMES` to change it.

## Third-party services

- The mapcn engine loads its web worker from unpkg, and its street basemap from CARTO.
- The Leaflet engine's street basemap uses OpenStreetMap tiles. Their
  [usage policy](https://operations.osmfoundation.org/policies/tiles/) doesn't allow
  heavy production traffic, so use a paid tile provider if you expect that.
- The plain map view needs no tile service.
