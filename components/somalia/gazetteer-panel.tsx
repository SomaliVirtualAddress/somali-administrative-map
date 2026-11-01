"use client"

import { Search } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Fragment, useMemo, useState } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatArea } from "@/lib/somalia/scene"
import type { MapScene, Selection, SomaliaData } from "@/lib/somalia/types"
import { cn } from "@/lib/utils"

const LIST_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.018 } },
}

const ROW_VARIANTS = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.22 } },
}

export function GazetteerPanel({
  data,
  scene,
  selection,
  onNavigate,
  onHighlight,
}: {
  data: SomaliaData
  scene: MapScene
  selection: Selection
  onNavigate: (pcode: string | null) => void
  onHighlight: (pcode: string | null) => void
}) {
  const [query, setQuery] = useState("")

  const region = data.regions.find(
    (r) => r.properties.pcode === selection.regionPcode
  )
  const district = data.districts.find(
    (d) => d.properties.pcode === selection.districtPcode
  )
  const place = district ?? region ?? data.country
  const capital = region
    ? data.capitals.find(
        (c) => c.properties.regionPcode === region.properties.pcode
      )
    : data.capitals.find((c) => c.properties.national)
  const share =
    (place.properties.areaKm2 / data.country.properties.areaKm2) * 100

  const facts = [
    {
      term: "Level",
      value: district ? "District" : region ? "Region" : "Country",
    },
    { term: "P-code", value: place.properties.pcode },
    { term: "Area", value: formatArea(place.properties.areaKm2) },
    ...(place !== data.country
      ? [
          {
            term: "Share of Somalia",
            value:
              share < 0.01
                ? "Under 0.01%"
                : `${share < 1 ? share.toFixed(2) : share.toFixed(1)}%`,
          },
        ]
      : [
          { term: "Regions", value: String(data.regions.length) },
          { term: "Districts", value: String(data.districts.length) },
        ]),
    // Every level shows six facts, so the list below doesn't jump between views.
    ...(region && !district
      ? [{ term: "Districts", value: String(region.properties.districtCount) }]
      : []),
    ...(district
      ? [{ term: "Region", value: district.properties.regionName }]
      : []),
    ...(capital
      ? [
          {
            term: district ? "Region capital" : "Capital",
            value: capital.properties.name,
          },
        ]
      : []),
  ]

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return null
    const regionHits = data.regions
      .filter((r) => r.properties.name.toLowerCase().includes(term))
      .map((r) => ({
        pcode: r.properties.pcode,
        name: r.properties.name,
        context: "Region",
      }))
    const districtHits = data.districts
      .filter((d) => d.properties.name.toLowerCase().includes(term))
      .map((d) => ({
        pcode: d.properties.pcode,
        name: d.properties.name,
        context: `District of ${d.properties.regionName}`,
      }))
    return [...regionHits, ...districtHits]
  }, [data, query])

  const crumbs = [
    { pcode: null, name: "Somalia" },
    ...(region
      ? [{ pcode: region.properties.pcode, name: region.properties.name }]
      : []),
    ...(district
      ? [{ pcode: district.properties.pcode, name: district.properties.name }]
      : []),
  ]

  const listHeading = district
    ? `Other districts of ${region?.properties.name}`
    : region
      ? "Districts"
      : "Regions"

  return (
    <aside className="flex max-h-[45svh] w-full shrink-0 flex-col overflow-y-auto border-t bg-card md:h-svh md:max-h-none md:w-[22rem] md:overflow-hidden md:border-t-0 md:border-r">
      <header className="flex flex-col gap-3 p-5 pb-4">
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => (
              <Fragment key={crumb.name}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {index === crumbs.length - 1 ? (
                    <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      render={
                        <button
                          type="button"
                          onClick={() => onNavigate(crumb.pcode)}
                        />
                      }
                    >
                      {crumb.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={place.properties.pcode}
            className="flex flex-col gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <h1 className="text-[2.5rem] leading-none font-bold tracking-tight text-primary">
              {place.properties.name}
            </h1>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {facts.map((fact) => (
                <div key={fact.term}>
                  <dt className="text-xs text-muted-foreground">{fact.term}</dt>
                  <dd className="font-medium tabular-nums">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </AnimatePresence>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Find a region or district"
            placeholder="Find a region or district"
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </header>

      <ScrollArea className="shrink-0 border-t md:min-h-0 md:flex-1 md:shrink">
        {results ? (
          results.length > 0 ? (
            <ul className="p-2">
              {results.map((result) => (
                <li key={result.pcode}>
                  <button
                    type="button"
                    className="flex w-full flex-col rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent"
                    onClick={() => {
                      setQuery("")
                      onNavigate(result.pcode)
                    }}
                  >
                    <span className="font-medium">{result.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {result.context}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              No place matches “{query.trim()}”. Check the spelling, as names
              follow the HDX Somali spellings, such as Burco for Burao.
            </p>
          )
        ) : (
          <div className="p-2">
            <h2 className="px-3 pt-2 pb-1 text-sm font-semibold">
              {listHeading}
            </h2>
            <motion.ul
              key={selection.regionPcode ?? "regions"}
              initial="hidden"
              animate="visible"
              variants={LIST_VARIANTS}
              onPointerLeave={() => onHighlight(null)}
            >
              {scene.rows.map((row) => (
                <motion.li key={row.pcode} variants={ROW_VARIANTS}>
                  <button
                    type="button"
                    aria-current={row.selected ? "true" : undefined}
                    className={cn(
                      "relative flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent",
                      row.selected && "font-semibold"
                    )}
                    onPointerEnter={() => onHighlight(row.pcode)}
                    onFocus={() => onHighlight(row.pcode)}
                    onBlur={() => onHighlight(null)}
                    onClick={() => onNavigate(row.pcode)}
                  >
                    {row.selected && (
                      <motion.span
                        layoutId="selected-row"
                        className="absolute inset-0 rounded-md bg-accent"
                        transition={{
                          type: "spring",
                          bounce: 0.15,
                          duration: 0.4,
                        }}
                      />
                    )}
                    <motion.span
                      className="relative size-3.5 shrink-0 overflow-hidden rounded-[3px] border border-foreground/15"
                      initial={false}
                      animate={{ backgroundColor: row.color }}
                      transition={{ duration: 0.4 }}
                    >
                      {row.hatched && (
                        <span className="hatch-swatch absolute inset-0" />
                      )}
                    </motion.span>
                    <span className="relative min-w-0 flex-1 truncate">
                      {row.name}
                    </span>
                    <span className="relative text-xs text-muted-foreground tabular-nums">
                      {row.valueLabel}
                    </span>
                  </button>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        )}
      </ScrollArea>

      <footer className="border-t p-4 text-xs leading-relaxed text-muted-foreground">
        Boundaries from{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://data.humdata.org/dataset/cod-ab-som"
          target="_blank"
          rel="noreferrer"
        >
          OCHA COD-AB on HDX
        </a>
        , version 3, valid from 8 January 2025, CC BY-IGO. Capitals and
        contested-area hatching are added by this app and are not part of that
        dataset.
      </footer>
    </aside>
  )
}
