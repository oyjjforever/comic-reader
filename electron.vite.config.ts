import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import vueSetupExtend from 'vite-plugin-vue-setup-extend'

// 站点白名单：构建期读取 resources/config/site-whitelist.json 的 sites 字段并以
// 常量注入主进程。该文件仅打包时使用，不随 extraResources 分发，安装后无法修改；
// sites 为空数组/缺失/解析失败 = 不限制
function loadSiteWhitelist(): string[] {
  try {
    const raw = JSON.parse(readFileSync(resolve(__dirname, 'resources/config/site-whitelist.json'), 'utf-8'))
    return Array.isArray(raw.sites)
      ? raw.sites.filter((s): s is string => typeof s === 'string')
      : []
  } catch {
    return []
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __SITE_WHITELIST__: JSON.stringify(loadSiteWhitelist())
    },
    build: {
      rollupOptions: {
        output: {
          format: 'cjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: [
        {
          find: '@',
          replacement: resolve(__dirname, './src')
        },
        {
          find: '@renderer',
          replacement: resolve(__dirname, './src/renderer/src')
        }
      ]
    },
    plugins: [
      vue(),
      vueSetupExtend(),
      AutoImport({
        // dirs: ['/src/renderer/**/**'],
        imports: [
          'vue',
          'vue-router',
          {
            'naive-ui': [
              'useDialog',
              'useMessage',
              'useNotification',
              'useLoadingBar',
              'useOsTheme'
            ]
          }
        ]
      }),
      Components({
        resolvers: [NaiveUiResolver()]
      })
    ]
  }
})
