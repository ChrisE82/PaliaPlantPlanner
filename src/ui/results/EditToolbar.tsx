/**
 * Edit-mode tool bar: Plant, Erase, Lock plant, Lock plot, Undo, Unlock all,
 * Re-optimize unlocked (project task spec, Task B step 1).
 */
import type { EditTool } from './GardenGrid';

const TOOLS: { value: EditTool; label: string }[] = [
  { value: 'plant', label: 'Plant' },
  { value: 'erase', label: 'Erase' },
  { value: 'lockPlant', label: 'Lock plant' },
  { value: 'lockPlot', label: 'Lock plot' },
];

export interface EditToolbarProps {
  tool: EditTool;
  onToolChange: (tool: EditTool) => void;
  onUndo: () => void;
  canUndo: boolean;
  onUnlockAll: () => void;
  canUnlockAll: boolean;
  onReoptimize: () => void;
  reoptimizing: boolean;
}

export default function EditToolbar({
  tool,
  onToolChange,
  onUndo,
  canUndo,
  onUnlockAll,
  canUnlockAll,
  onReoptimize,
  reoptimizing,
}: EditToolbarProps) {
  return (
    <div className="edit-toolbar">
      <div className="edit-toolbar__tools" role="toolbar" aria-label="Edit tool">
        {TOOLS.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={tool === t.value}
            className="edit-toolbar__tool"
            onClick={() => onToolChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="edit-toolbar__actions">
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={onUnlockAll} disabled={!canUnlockAll}>
          Unlock all
        </button>
        <button type="button" onClick={onReoptimize} disabled={reoptimizing}>
          {reoptimizing ? 'Re-optimizing...' : 'Re-optimize unlocked'}
        </button>
      </div>
    </div>
  );
}
