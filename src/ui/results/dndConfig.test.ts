import type { Active, Over } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../../data/crops';
import { createDragAnnouncements } from './dndConfig';
import type { DragItemData } from './dragDrop';

function makeActive(data: DragItemData): Active {
  return { id: 'active-1', data: { current: data }, rect: { current: { initial: null, translated: null } } };
}

function makeOver(data: { x: number; y: number } | null): Over | null {
  if (!data) return null;
  return {
    id: 'tile-3-0',
    data: { current: data },
    disabled: false,
    rect: { width: 40, height: 40, top: 0, left: 0, right: 40, bottom: 40 },
  };
}

describe('createDragAnnouncements', () => {
  const announcements = createDragAnnouncements(CROP_BY_ID);

  it('names the crop when picked up', () => {
    const active = makeActive({ kind: 'palette', cropId: 'apple' });
    expect(announcements.onDragStart({ active })).toBe('Picked up Apple.');
  });

  it('names the crop and tile while over a tile', () => {
    const active = makeActive({ kind: 'plant', index: 0, cropId: 'wheat', x: 0, y: 0 });
    const over = makeOver({ x: 3, y: 0 });
    expect(announcements.onDragOver({ active, over })).toBe('Wheat is over column 4, row 1.');
  });

  it('says the crop left the tiles when not over anything', () => {
    const active = makeActive({ kind: 'palette', cropId: 'wheat' });
    expect(announcements.onDragOver({ active, over: null })).toBe('Wheat is no longer over a tile.');
  });

  it('reports where a drop landed, and falls back to the id for an unknown crop', () => {
    const active = makeActive({ kind: 'plant', index: 0, cropId: 'not-a-crop', x: 0, y: 0 });
    const over = makeOver({ x: 1, y: 2 });
    expect(announcements.onDragEnd({ active, over })).toBe('not-a-crop was dropped over column 2, row 3.');
  });

  it('reports no change when dropped outside the garden', () => {
    const active = makeActive({ kind: 'palette', cropId: 'apple' });
    expect(announcements.onDragEnd({ active, over: null })).toBe('Apple was dropped outside the garden. No change.');
  });

  it('reports a cancelled move', () => {
    const active = makeActive({ kind: 'plant', index: 0, cropId: 'apple', x: 0, y: 0 });
    expect(announcements.onDragCancel({ active, over: null })).toBe('Moving Apple was cancelled.');
  });
});
