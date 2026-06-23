'use client'
import dynamic from 'next/dynamic'

const ModelerApp = dynamic(() => import('@/components/modeler/ModelerApp'), { ssr: false })

export default function FloorPlanPage() {
  return <ModelerApp />
}
