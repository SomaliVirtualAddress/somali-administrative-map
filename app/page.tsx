import { Suspense } from "react"

import { SomaliaExplorer } from "@/components/somalia/somalia-explorer"

export default function Page() {
  return (
    <Suspense>
      <SomaliaExplorer />
    </Suspense>
  )
}
