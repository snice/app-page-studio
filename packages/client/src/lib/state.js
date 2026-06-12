/**
 * 全局 store。按域切片到 ./slices/*，本文件只做组装。
 * 对外 API 保持不变：所有方法/字段都从 useAppStore 单一入口访问。
 */
import { create } from 'zustand';
import { createUiSlice } from './slices/uiSlice';
import { createConfigSlice } from './slices/configSlice';
import { createSessionSlice } from './slices/sessionSlice';
import { createPagesSlice } from './slices/pagesSlice';
import { createFilesSlice } from './slices/filesSlice';
import { createPickerSlice } from './slices/pickerSlice';
import { createPsdSlice } from './slices/psdSlice';
import { createModalsSlice } from './slices/modalsSlice';

export const useAppStore = create((set, get) => ({
  ...createUiSlice(set, get),
  ...createConfigSlice(set, get),
  ...createSessionSlice(set, get),
  ...createPagesSlice(set, get),
  ...createFilesSlice(set, get),
  ...createPickerSlice(set, get),
  ...createPsdSlice(set, get),
  ...createModalsSlice(set, get),
}));
