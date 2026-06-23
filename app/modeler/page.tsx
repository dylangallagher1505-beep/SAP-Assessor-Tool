import dynamic from 'next/dynamic'

// All three-d components must be client-only (no SSR)
const ModelerApp = dynamic(() => import('@/components/modeler/ModelerApp'), { ssr: false })

export default function ModelerPage() {
  return <ModelerApp />
}
