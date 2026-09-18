/**
 * One dnd-kit context for the whole app, so a crop can be dragged from the
 * palette to the goals board or to the garden.
 *
 * Areas plug in with useDropHandler (decide what a drop means) and, when the
 * default preview isn't enough, useDragPreview (what follows the pointer).
 * The provider tracks the active item so areas can show drop zones.
 */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CROP_BY_ID } from '../../data/crops';
import { goalLabel } from '../../engine/goals';
import { BUFF_NAMES, IMPORTANCE_NAMES } from '../../engine/types';
import { BuffBadgeFace } from '../palette/BuffBadge';
import { CropTileFace } from '../palette/CropTile';
import { useStore } from '../state/store';
import type { DndData, DragItem, DropTarget } from './types';

/** Returns true when it handled the drop; later handlers are then skipped. */
export type DropHandler = (item: DragItem, target: DropTarget | null) => boolean;
/** Returns a preview for the item, or null to leave it to the next renderer or the default. */
export type PreviewRenderer = (item: DragItem) => ReactNode | null;

interface AppDndValue {
  activeItem: DragItem | null;
  registerDropHandler: (handler: DropHandler) => () => void;
  registerPreview: (renderer: PreviewRenderer) => () => void;
}

const AppDndContext = createContext<AppDndValue | null>(null);

function itemOf(data: unknown): DragItem | null {
  return (data as DndData | undefined)?.item ?? null;
}

function targetOf(data: unknown): DropTarget | null {
  return (data as DndData | undefined)?.target ?? null;
}

// Whatever is under the pointer first; otherwise the closest target, which
// keyboard dragging needs because it has no pointer position.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
};

function cropName(cropId: string): string {
  return CROP_BY_ID.get(cropId)?.name ?? cropId;
}

function describeItem(item: DragItem | null): string {
  if (!item) return 'the item';
  switch (item.kind) {
    case 'palette-crop':
    case 'helper':
    case 'plant':
      return cropName(item.cropId);
    case 'palette-buff':
      return BUFF_NAMES[item.buff];
    case 'goal': {
      const goal = useStore.getState().settings.goals.find((g) => g.id === item.goalId);
      return goal ? `the goal ${goalLabel(goal, CROP_BY_ID)}` : 'the goal';
    }
  }
}

function describeTarget(target: DropTarget | null): string {
  if (!target) return 'nothing';
  switch (target.kind) {
    case 'lane':
      return `the ${IMPORTANCE_NAMES[target.importance]} goals`;
    case 'goal': {
      const goal = useStore.getState().settings.goals.find((g) => g.id === target.goalId);
      return goal ? `the goal ${goalLabel(goal, CROP_BY_ID)}` : 'a goal';
    }
    case 'helpers':
      return 'the helpers';
    case 'trash':
      return 'the remove area';
    case 'tile':
      return `the garden tile at column ${target.x + 1}, row ${target.y + 1}`;
  }
}

const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${describeItem(itemOf(active.data.current))}.`,
  onDragOver: ({ active, over }) =>
    over
      ? `${describeItem(itemOf(active.data.current))} is over ${describeTarget(targetOf(over.data.current))}.`
      : `${describeItem(itemOf(active.data.current))} is not over a drop area.`,
  onDragEnd: ({ active, over }) =>
    over
      ? `Dropped ${describeItem(itemOf(active.data.current))} on ${describeTarget(targetOf(over.data.current))}.`
      : `${describeItem(itemOf(active.data.current))} was dropped outside any drop area.`,
  onDragCancel: ({ active }) => `Stopped dragging ${describeItem(itemOf(active.data.current))}.`,
};

function DefaultPreview({ item }: { item: DragItem }) {
  if (item.kind === 'palette-buff') return <BuffBadgeFace buff={item.buff} showLabel lifted />;
  if (item.kind === 'goal') return null;
  const crop = CROP_BY_ID.get(item.cropId);
  return crop ? <CropTileFace crop={crop} lifted /> : null;
}

export function AppDndProvider({ children }: { children: ReactNode }) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null);
  const handlers = useRef<DropHandler[]>([]);
  const previews = useRef<PreviewRenderer[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const registerDropHandler = useCallback((handler: DropHandler) => {
    handlers.current = [...handlers.current, handler];
    return () => {
      handlers.current = handlers.current.filter((h) => h !== handler);
    };
  }, []);

  const registerPreview = useCallback((renderer: PreviewRenderer) => {
    previews.current = [...previews.current, renderer];
    return () => {
      previews.current = previews.current.filter((r) => r !== renderer);
    };
  }, []);

  function handleDragStart(event: DragStartEvent) {
    setActiveItem(itemOf(event.active.data.current));
  }

  function handleDragEnd(event: DragEndEvent) {
    const item = itemOf(event.active.data.current);
    const target = targetOf(event.over?.data.current);
    setActiveItem(null);
    if (!item) return;
    for (const handler of handlers.current) {
      if (handler(item, target)) return;
    }
  }

  function renderPreview(item: DragItem): ReactNode {
    for (const renderer of previews.current) {
      const preview = renderer(item);
      if (preview) return preview;
    }
    return <DefaultPreview item={item} />;
  }

  const value = useMemo(
    () => ({ activeItem, registerDropHandler, registerPreview }),
    [activeItem, registerDropHandler, registerPreview],
  );

  return (
    <AppDndContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveItem(null)}
        accessibility={{ announcements }}
      >
        {children}
        <DragOverlay dropAnimation={null}>{activeItem ? renderPreview(activeItem) : null}</DragOverlay>
      </DndContext>
    </AppDndContext.Provider>
  );
}

function useAppDnd(): AppDndValue {
  const value = useContext(AppDndContext);
  if (!value) throw new Error('AppDndProvider is missing.');
  return value;
}

/** The item being dragged right now, or null. */
export function useActiveDragItem(): DragItem | null {
  return useAppDnd().activeItem;
}

/**
 * Registers a drop handler for as long as the component is mounted. The
 * latest `handler` is always called, so it may close over current props.
 */
export function useDropHandler(handler: DropHandler): void {
  const { registerDropHandler } = useAppDnd();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => registerDropHandler((item, target) => latest.current(item, target)), [registerDropHandler]);
}

/** Registers a drag preview renderer for as long as the component is mounted. */
export function useDragPreview(renderer: PreviewRenderer): void {
  const { registerPreview } = useAppDnd();
  const latest = useRef(renderer);
  latest.current = renderer;
  useEffect(() => registerPreview((item) => latest.current(item)), [registerPreview]);
}
