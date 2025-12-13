import { defineStore } from 'pinia'
import PixivUtil from '@renderer/views/special-attention/pixiv.js'
import JmttUtil from '@renderer/views/special-attention/jmtt.js'
import TwitterUtil from '@renderer/views/special-attention/twitter.js'

export const useNewArtworkDetectorStore = defineStore('newArtworkDetector', {
  state: () => ({
    isDetecting: false,
    lastCheckTime: null,
    checkInterval: null,
    newArtworkAuthors: new Set(), // 存储有新作品的作者ID
    detectionHistory: [] // 检测历史记录
  }),

  getters: {
    // 获取有新作品的作者数量
    newArtworkCount: (state) => state.newArtworkAuthors.size,

    // 检查指定作者是否有新作品
    hasNewArtwork: (state) => (source, authorId) => {
      return state.newArtworkAuthors.has(`${source}_${authorId}`)
    },

    // 获取最后检测时间
    lastCheckTimeFormatted: (state) => {
      if (!state.lastCheckTime) return '从未检测'
      const date = new Date(state.lastCheckTime)
      return date.toLocaleString()
    }
  },

  actions: {
    /**
     * 检测所有特别关注作者的新作品
     * @param {Function} onNewArtworkFound - 发现新作品时的回调函数
     * @returns {Promise<{total: number, newWorks: Array}>}
     */
    async detectNewArtworks(onNewArtworkFound = null) {
      if (this.isDetecting) {
        return { total: 0, newWorks: 0, newWorksList: [] }
      }

      this.isDetecting = true
      const startTime = Date.now()

      try {
        const authors = await window.specialAttention.list()
        let totalAuthors = authors.length
        let newWorksCount = 0
        const newWorks = []

        for (const author of authors) {
          try {
            let hasNew = false

            // 根据来源调用相应的检测方法
            if (author.source === 'pixiv') {
              hasNew = await PixivUtil.hasNewArtwork(author.authorName, author.authorId)
            } else if (author.source === 'jmtt') {
              hasNew = await JmttUtil.hasNewArtwork(author.authorName, author.authorId)
            } else if (author.source === 'twitter') {
              hasNew = await TwitterUtil.hasNewArtwork(author.authorName, author.authorId)
            }

            if (hasNew) {
              newWorksCount++
              newWorks.push({
                id: author.id,
                authorName: author.authorName,
                authorId: author.authorId,
                source: author.source
              })

              // 如果作者之前没有新作品标记，则调用回调
              if (!this.newArtworkAuthors.has(`${author.source}_${author.authorId}`)) {
                this.newArtworkAuthors.add(`${author.source}_${author.authorId}`)

                if (onNewArtworkFound) {
                  onNewArtworkFound({
                    authorName: author.authorName,
                    source: author.source
                  })
                }
              }
            } else {
              // 如果没有新作品，从集合中移除
              this.newArtworkAuthors.delete(`${author.source}_${author.authorId}`)
            }
          } catch (error) {
            console.error(`检测作者 ${author.authorName}(${author.source}) 的新作品时出错:`, error)
          }
        }

        this.lastCheckTime = Date.now()
        const duration = (this.lastCheckTime - startTime) / 1000

        // 添加到检测历史
        this.detectionHistory.unshift({
          timestamp: this.lastCheckTime,
          totalAuthors,
          newWorksCount,
          duration
        })

        // 限制历史记录数量
        if (this.detectionHistory.length > 10) {
          this.detectionHistory = this.detectionHistory.slice(0, 10)
        }

        console.log(
          `新作品检测完成，共检查 ${totalAuthors} 位作者，发现 ${newWorksCount} 位有新作品，耗时 ${duration}s`
        )

        return {
          total: totalAuthors,
          newWorks: newWorksCount,
          newWorksList: newWorks,
          duration
        }
      } catch (error) {
        console.error('检测新作品时出错:', error)
        return { total: 0, newWorks: 0, newWorksList: [], duration: 0 }
      } finally {
        this.isDetecting = false
      }
    },

    /**
     * 启动定时检测
     * @param {number} interval - 检测间隔（毫秒），默认30分钟
     * @param {Function} onNewArtworkFound - 发现新作品时的回调函数
     */
    startPeriodicCheck(interval = 30 * 60 * 1000, onNewArtworkFound = null) {
      // 清除现有的定时器
      this.stopPeriodicCheck()

      // 立即执行一次检测
      this.detectNewArtworks(onNewArtworkFound)

      // 设置定时检测
      this.checkInterval = setInterval(() => {
        this.detectNewArtworks(onNewArtworkFound)
      }, interval)

      console.log(`启动定时检测，间隔 ${interval / 1000 / 60} 分钟`)
    },

    /**
     * 停止定时检测
     */
    stopPeriodicCheck() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval)
        this.checkInterval = null
        console.log('停止定时检测')
      }
    },

    /**
     * 清除指定作者的新作品标记
     * @param {string} source - 来源 (pixiv/jmtt/twitter)
     * @param {string} authorId - 作者ID
     */
    clearNewArtworkMark(source, authorId) {
      this.newArtworkAuthors.delete(`${source}_${authorId}`)
    },

    /**
     * 清除所有新作品标记
     */
    clearAllNewArtworkMarks() {
      this.newArtworkAuthors.clear()
    },

    /**
     * 重置检测状态
     */
    resetDetectionState() {
      this.isDetecting = false
      this.lastCheckTime = null
      this.newArtworkAuthors.clear()
      this.detectionHistory = []
      this.stopPeriodicCheck()
    }
  }
})
