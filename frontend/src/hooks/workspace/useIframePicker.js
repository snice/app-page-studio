import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../lib/state';
import { Picker, ColorPickerModule } from '../../lib/picker';

/**
 * 元素 / 颜色 / 图片区域 三种 picker 的统一管理。
 * 负责：
 *  - iframe 点击 → 显示动作菜单
 *  - 颜色取色回调
 *  - 切换 picker 时互斥关闭其它 picker
 *  - 路由切换 / 文件切换时清理
 */
export function useIframePicker({ iframeRef }) {
  const showToast = useAppStore((s) => s.showToast);
  const currentFile = useAppStore((s) => s.currentFile);
  const currentProjectId = useAppStore((s) => s.config.currentProject);
  const isPickerActive = useAppStore((s) => s.isPickerActive);
  const isColorPickerActive = useAppStore((s) => s.isColorPickerActive);
  const setIsImageRegionSelecting = useAppStore((s) => s.setIsImageRegionSelecting);
  const addInteraction = useAppStore((s) => s.addInteraction);
  const addImageReplacement = useAppStore((s) => s.addImageReplacement);
  const addFunctionDescription = useAppStore((s) => s.addFunctionDescription);
  const setPickedColors = useAppStore((s) => s.setPickedColors);

  const [pickerMenu, setPickerMenu] = useState(null);
  const [stylesPanelSelector, setStylesPanelSelector] = useState(null);
  const [mindMapOpen, setMindMapOpen] = useState(false);

  const handleElementClick = useCallback((selector, eventType, mouseEvent) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const iframeRect = iframe.getBoundingClientRect();
    const zoom = iframeRect.width / iframe.offsetWidth || 1;
    const menuX = iframeRect.left + mouseEvent.clientX * zoom;
    const menuY = iframeRect.top + mouseEvent.clientY * zoom;
    setPickerMenu({ x: menuX, y: menuY, selector, eventType });
  }, [iframeRef]);

  const handleColorPicked = useCallback((hex, copied = true) => {
    const state = useAppStore.getState();
    const colors = [...state.pickedColors];
    if (!colors.includes(hex)) colors.push(hex);
    setPickedColors(colors);
    showToast(copied ? `已复制: ${hex}` : `已取色: ${hex}（剪贴板写入失败，请手动复制）`);
  }, [setPickedColors, showToast]);

  const handlePickerAction = useCallback((action, selector, eventType) => {
    setPickerMenu(null);
    const iframe = iframeRef.current;
    if (iframe) {
      Picker.disable(iframe);
      useAppStore.getState().setIsPickerActive(false);
    }
    if (action === 'interaction') {
      addInteraction({ selector, eventType: eventType || 'tap', action: '' });
      showToast(`已添加交互: ${selector}`);
    } else if (action === 'image') {
      addImageReplacement({ selector, imagePath: '', description: '' });
      showToast(`已添加切图标记: ${selector}`);
    } else if (action === 'function') {
      addFunctionDescription({ selector, description: '' });
      showToast(`已添加功能描述: ${selector}`);
    } else if (action === 'styles') {
      setStylesPanelSelector(selector);
    }
  }, [iframeRef, addInteraction, addImageReplacement, addFunctionDescription, showToast]);

  const handleRegionAction = useCallback((action, region) => {
    if (action === 'interaction') {
      addInteraction({ selector: '区域', eventType: 'tap', action: '', region });
      showToast('已添加交互区域');
    } else if (action === 'image') {
      addImageReplacement({ selector: '区域', imagePath: '', description: '', region });
      showToast('已添加切图标记区域');
    } else if (action === 'function') {
      addFunctionDescription({ selector: '区域', description: '', region });
      showToast('已添加功能描述区域');
    }
  }, [addInteraction, addImageReplacement, addFunctionDescription, showToast]);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const state = useAppStore.getState();
    if (state.isPickerActive) {
      setTimeout(() => { Picker.enable(iframe, handleElementClick); }, 100);
    }
    if (state.isColorPickerActive) {
      setTimeout(() => {
        ColorPickerModule.disable();
        ColorPickerModule.enable(iframe, handleColorPicked);
      }, 100);
    }
  }, [iframeRef, handleElementClick, handleColorPicked]);

  const handleTogglePicker = useCallback(() => {
    const state = useAppStore.getState();
    const cf = state.currentFile;
    const isPsdLayers = cf?.sourceType === 'psd' && state.psdMode === 'layers';
    const isImage = (cf?.sourceType === 'image' || (cf?.sourceType === 'psd' && !isPsdLayers));

    if (isImage) {
      const willSelect = !state.isImageRegionSelecting;
      if (willSelect) {
        if (state.isColorPickerActive) {
          state.setIsColorPickerActive(false);
          ColorPickerModule.disable(iframeRef.current);
        }
        if (state.isPickerActive) {
          state.setIsPickerActive(false);
          if (iframeRef.current) Picker.disable(iframeRef.current);
          setPickerMenu(null);
        }
      }
      setIsImageRegionSelecting(willSelect);
      return;
    }

    const iframe = iframeRef.current;
    const willActivate = !state.isPickerActive;

    if (willActivate && state.isColorPickerActive) {
      state.setIsColorPickerActive(false);
      if (iframe) ColorPickerModule.disable(iframe);
    }
    if (willActivate && state.isImageRegionSelecting) {
      setIsImageRegionSelecting(false);
    }

    state.setIsPickerActive(willActivate);
    if (iframe) {
      if (willActivate) Picker.enable(iframe, handleElementClick);
      else { Picker.disable(iframe); setPickerMenu(null); }
    }
  }, [iframeRef, handleElementClick, setIsImageRegionSelecting]);

  const handleToggleColorPicker = useCallback(() => {
    const state = useAppStore.getState();
    const iframe = iframeRef.current;
    const willActivate = !state.isColorPickerActive;

    if (willActivate && state.isPickerActive) {
      state.setIsPickerActive(false);
      if (iframe) Picker.disable(iframe);
      setPickerMenu(null);
    }
    if (willActivate && state.isImageRegionSelecting) setIsImageRegionSelecting(false);

    state.setIsColorPickerActive(willActivate);
    if (willActivate) {
      if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        ColorPickerModule.enable(iframe, handleColorPicked);
      } else {
        const container = document.querySelector('.phone-screen');
        ColorPickerModule.enable(null, handleColorPicked, { container });
      }
    } else {
      ColorPickerModule.disable(iframe);
    }
  }, [iframeRef, handleColorPicked, setIsImageRegionSelecting]);

  // 外部（路由切换等）将选择器关闭时，确保 iframe 解绑并关闭动作菜单
  useEffect(() => {
    if (!isPickerActive) {
      if (iframeRef.current) Picker.disable(iframeRef.current);
      setPickerMenu(null);
    }
  }, [isPickerActive, iframeRef]);
  useEffect(() => {
    if (!isColorPickerActive) ColorPickerModule.disable(iframeRef.current);
  }, [isColorPickerActive, iframeRef]);

  // 切换文件时关闭动作菜单与样式面板
  useEffect(() => {
    setPickerMenu(null);
    setStylesPanelSelector(null);
  }, [currentFile]);

  // 切换项目时关闭思维导图
  useEffect(() => {
    setMindMapOpen(false);
  }, [currentProjectId]);

  return {
    pickerMenu, setPickerMenu,
    stylesPanelSelector, setStylesPanelSelector,
    mindMapOpen, setMindMapOpen,
    handleElementClick, handleColorPicked,
    handlePickerAction, handleRegionAction,
    handleIframeLoad,
    handleTogglePicker, handleToggleColorPicker,
  };
}
