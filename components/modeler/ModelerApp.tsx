'use client'
import DrawingCanvas from './DrawingCanvas'
import ThreeDPreview from './ThreeDPreview'
import StoryPanel from './StoryPanel'
import TakeoffPanel from './TakeoffPanel'
import Toolbar from './Toolbar'
import FaceEditorPanel from './FaceEditorPanel'
import { useModelerStore } from '@/lib/modelerStore'

export default function ModelerApp() {
  const viewMode = useModelerStore((s) => s.viewMode)
  const show2D = viewMode === '2d' || viewMode === 'split'
  const show3D = viewMode === '3d' || viewMode === 'split'

  return (
    <div className="flex flex-col h-full text-gray-800 overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 pt-2 shrink-0">
        <Toolbar />
      </div>

      {/* Main layout */}
      <div className="flex flex-1 gap-3 p-3 min-h-0">
        {/* Left: Stories + Roof + Openings */}
        <div className="w-64 shrink-0">
          <StoryPanel />
        </div>

        {/* Centre: 2D Canvas */}
        {show2D && (
          <div className="flex-1 min-w-0 flex flex-col">
            <DrawingCanvas className="flex-1" />
          </div>
        )}

        {/* Right: 3D Preview (with face editor overlay) */}
        {show3D && (
          <div className="flex-1 min-w-0 flex flex-col gap-3 relative">
            <ThreeDPreview className="flex-1" />
            <FaceEditorPanel />
          </div>
        )}

        {/* Far right: Takeoff */}
        <div className="w-80 shrink-0">
          <TakeoffPanel />
        </div>
      </div>
    </div>
  )
}
