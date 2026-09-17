/**
 * Edit-mode tool bar: Plant, Erase, Lock plant, Lock plot as a segmented
 * control, plus Undo, Unlock all, Re-optimize unlocked (project task spec,
 * Task B step 1).
 */
import type { ReactNode } from 'react';
import { EraserIcon, LockIcon, SproutIcon, UndoIcon, WandIcon } from '../icons';
import type { EditTool } from './GardenGrid';

const TOOLS: { value: EditTool; label: string; icon: ReactNode }[] = [
  { value: 'plant', label: 'Plant', icon: <SproutIcon /> },
  { value: 'erase', label: 'Erase', icon: <EraserIcon /> },
  { value: 'lockPlant', label: 'Lock plant', icon: <LockIcon /> },
  { value: 'lockPlot', label: 'Lock plot', icon: <LockIcon /> },
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
      <fieldset className="segmented edit-toolbar__tools">
        <legend className="visually-hidden">Edit tool</legend>
        {TOOLS.map((t) => (
          <span className="segmented__option" key={t.value}>
            <input
              type="radio"
              name="edit-tool"
              id={`edit-tool-${t.value}`}
              checked={tool === t.value}
              onChange={() => onToolChange(t.value)}
            />
            <label className="segmented__label" htmlFor={`edit-tool-${t.value}`}>
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </label>
          </span>
        ))}
      </fieldset>
      <div className="edit-toolbar__actions">
        <button type="button" className="btn--sm" onClick={onUndo} disabled={!canUndo}>
          <UndoIcon aria-hidden="true" />
          Undo
        </button>
        <button type="button" className="btn--sm" onClick={onUnlockAll} disabled={!canUnlockAll}>
          <LockIcon aria-hidden="true" />
          Unlock all
        </button>
        <button type="button" className="btn--sm primary" onClick={onReoptimize} disabled={reoptimizing}>
          <WandIcon aria-hidden="true" />
          {reoptimizing ? 'Re-optimizing...' : 'Re-optimize unlocked'}
        </button>
      </div>
    </div>
  );
}
