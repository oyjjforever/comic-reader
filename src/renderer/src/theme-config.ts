/**
 * Naive UI 主题配置文件
 * 在这里修改 primary 颜色值
 */

export const themeColors = {
  // 主色调 - 修改这个值来改变整个应用的主色调
  primary: '#322f3beb', // 深紫色/灰蓝色
  // 自动生成的相关颜色（基于主色调）
  // 这些颜色会根据主色调自动调整，通常不需要手动修改
  hover: '#4A4656',    // 悬停时的颜色（更亮一些）
  pressed: '#1F1D29',  // 按下时的颜色（更暗一些）
  suppl: '#4A4656',     // 补充颜色（与hover相同）
}

// 预设的主题颜色方案
export const presetThemes = {
  green: {
    primary: '#18a058',
    hover: '#36ad6a',
    pressed: '#0c7a43',
    suppl: '#36ad6a',
  },
  blue: {
    primary: '#2080f0',
    hover: '#4098fc',
    pressed: '#1060c9',
    suppl: '#4098fc',
  },
  purple: {
    primary: '#8a2be2',
    hover: '#9b4ff2',
    pressed: '#6a1fb9',
    suppl: '#9b4ff2',
  },
  red: {
    primary: '#d03050',
    hover: '#de576d',
    pressed: '#ab1f3f',
    suppl: '#de576d',
  },
  orange: {
    primary: '#FF9205',
    hover: '#FFA740',
    pressed: '#E67E00',
    suppl: '#FFA740',
  },
  teal: {
    primary: '#00adb5',
    hover: '#33c5cc',
    pressed: '#008a91',
    suppl: '#33c5cc',
  },
  dark: {
    primary: '#322F3B',
    hover: '#4A4656',
    pressed: '#1F1D29',
    suppl: '#4A4656',
  }
}

// 使用预设主题的函数
export function usePresetTheme(themeName: keyof typeof presetThemes) {
  return presetThemes[themeName]
}