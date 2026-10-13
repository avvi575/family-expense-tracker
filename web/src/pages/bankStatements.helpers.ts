import type { BankStatementRow, User } from '../types';
import { create } from 'zustand';

interface RowState extends BankStatementRow {
  parentSelected: string;
  subSelected: string;
  committedDescription: string;
}

export function isEligibleRow(row: Pick<RowState, 'isCredit' | 'duplicate'>) {
  return !row.isCredit && !row.duplicate;
}

export function effectiveCategoryId(row: Pick<RowState, 'subSelected' | 'parentSelected' | 'categoryId' | 'suggestedCategoryId'>) {
  return row.subSelected || row.parentSelected || row.categoryId || row.suggestedCategoryId || null;
}

// Shared state setter to allow child components to update rows in parent
// (using zustand store to avoid prop drilling)

interface RowsStore {
  rows: RowState[];
  setRows: (rows: RowState[]) => void;
  setRowsState: (updater: (prev: RowState[]) => RowState[]) => void;
}

export const useRowsStore = create<RowsStore>((set) => ({
  rows: [],
  setRows: (rows) => set({ rows }),
  setRowsState: (updater) => set((s) => ({ rows: updater(s.rows) })),
}));

export function setRowsState(updater: (prev: RowState[]) => RowState[]) {
  useRowsStore.getState().setRowsState(updater);
}

export type { RowState };