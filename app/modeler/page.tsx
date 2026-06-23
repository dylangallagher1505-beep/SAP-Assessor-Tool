'use client'
import dynamic from 'next/dynamic'

// ssr: false required here — R3F and canvas APIs are browser-only
const ModelerApp = dynamic(() => import('@/components/modeler/ModelerApp'), { ssr: false })

export default function ModelerPage() {
  return <ModelerApp />
}
