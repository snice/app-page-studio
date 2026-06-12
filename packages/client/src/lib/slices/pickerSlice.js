/**
 * Picker（元素/颜色/区域）激活状态 + 取色历史。
 */
export function createPickerSlice(set, get) {
  return {
    isPickerActive: false,
    isColorPickerActive: false,
    isImageRegionSelecting: false,
    pickedColors: [],

    setIsPickerActive(v) { set({ isPickerActive: v }); },
    setIsColorPickerActive(v) { set({ isColorPickerActive: v }); },
    setIsImageRegionSelecting(v) { set({ isImageRegionSelecting: v }); },
    setPickedColors(colors) { set({ pickedColors: colors }); },
  };
}
