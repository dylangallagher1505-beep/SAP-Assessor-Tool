'use client'
import DrawingCanvas from './DrawingCanvas'
import ThreeDPreview from './ThreeDPreview'
import StoryPanel from './StoryPanel'
import TakeoffPanel from './TakeoffPanel'
import Toolbar from './Toolbar'

export default function ModelerApp() {
  return (
    <div className="flex flex-col h-full bg-gray-50 text-gray-800 overflow-hidden">
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
        <div className="flex-1 min-w-0 flex flex-col">
          <DrawingCanvas className="flex-1" />
        </div>

        {/* Right: 3D Preview */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <ThreeDPreview className="flex-1" />
        </div>

        {/* Far right: Takeoff */}
        <div className="w-52 shrink-0">
          <TakeoffPanel />
        </div>
      </div>
    </div>
  )
}
