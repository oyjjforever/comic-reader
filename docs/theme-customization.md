# Naive UI 主题自定义指南

## 概述

本项目已经配置好了 Naive UI 的主题系统，你可以轻松地修改应用的主色调。

## 如何修改主题颜色

### 方法一：直接修改配置文件（推荐）

1. 打开 `src/renderer/src/theme-config.ts` 文件
2. 找到 `themeColors` 对象
3. 修改 `primary` 值为你想要的颜色：

```typescript
export const themeColors = {
  primary: '#2080f0', // 修改为你喜欢的颜色，例如蓝色
  hover: '#4098fc',
  pressed: '#1060c9',
  suppl: '#4098fc',
}
```

### 方法二：使用预设主题

在 `theme-config.ts` 中，我们提供了几个预设的主题方案：

```typescript
// 在 App.vue 中导入预设主题
import { presetThemes } from '@renderer/theme-config'

// 使用预设主题
const currentTheme = presetThemes.dark // 可选: green, blue, purple, red, orange, teal, dark
```

### 方法三：完全自定义

如果你想完全自定义颜色，可以修改 `App.vue` 中的 `themeOverrides` 计算属性：

```typescript
const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: '#your-color', // 你的主色调
    primaryColorHover: '#your-hover-color', // 悬停颜色
    primaryColorPressed: '#your-pressed-color', // 按下颜色
    primaryColorSuppl: '#your-suppl-color', // 补充颜色
  },
  // 其他组件的自定义样式
  Button: {
    textColorPrimary: '#ffffff',
  },
}))
```

## 颜色选择建议

选择主色调时，建议考虑以下几点：

1. **可访问性**：确保颜色对比度足够，便于阅读
2. **一致性**：与应用整体风格保持一致
3. **情感色彩**：不同颜色传达不同的情感：
   - 绿色：自然、成功、平衡
   - 蓝色：专业、信任、稳定
   - 紫色：创意、奢华、神秘
   - 红色：热情、紧急、警告
   - 橙色：活力、友好、温暖
   - 青色：清新、现代、科技
   - 深紫色/灰蓝色：优雅、沉稳、高级感

## 主题变量说明

- `primaryColor`: 主要颜色，用于按钮、链接等主要交互元素
- `primaryColorHover`: 鼠标悬停时的颜色
- `primaryColorPressed`: 鼠标按下时的颜色
- `primaryColorSuppl`: 补充颜色，用于一些辅助场景

## 应用场景

修改主题颜色后，以下 Naive UI 组件会自动应用新颜色：

- 按钮 (Button)
- 链接 (Link)
- 标签 (Tag)
- 进度条 (Progress)
- 开关 (Switch)
- 复选框 (Checkbox)
- 单选框 (Radio)
- 以及其他使用主色调的组件

## 注意事项

1. 修改颜色后，可能需要同时调整 `hover`、`pressed` 和 `suppl` 颜色以保持视觉一致性
2. 如果使用预设主题，这些颜色已经自动配置好了
3. 主题修改会立即生效，无需重启应用

## 高级自定义

如果你需要更精细的控制，可以参考 [Naive UI 官方文档](https://www.naiveui.com/en-US/os-theme) 了解更多主题定制选项。