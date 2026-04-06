import log from '../utils/log'
import { Bonjour } from 'bonjour-service'

/**
 * mDNS 服务发现管理器
 * 使用 bonjour-service 在局域网中广播服务
 */
export class ServiceDiscovery {
    private service: any = null
    private bonjour: any = null

    /**
     * 启动 mDNS 服务广播
     * @param port HTTP 服务器端口
     */
    async start(port: number): Promise<void> {
        try {
            // 动态导入，避免在不需要时加载

            this.bonjour = new Bonjour()

            const os = require('os')
            const hostname = os.hostname()

            // 广播服务
            this.service = this.bonjour.publish({
                name: `Comic Reader on ${hostname}`,
                type: 'comic-reader',
                protocol: 'tcp',
                port: port,
                txt: {
                    version: '1.0.0',
                    hostname: hostname,
                    platform: process.platform
                }
            })

            this.service.on('up', () => {
                log.info(`[Discovery] mDNS service published: Comic Reader on ${hostname}:${port}`)
            })

            this.service.on('error', (err: any) => {
                log.error(`[Discovery] mDNS service error: ${err.message}`)
            })
        } catch (error: any) {
            log.warn(`[Discovery] Failed to start mDNS (bonjour-service may not be installed): ${error.message}`)
        }
    }

    /**
     * 停止 mDNS 服务广播
     */
    stop(): void {
        if (this.service) {
            try {
                this.service.stop()
                log.info('[Discovery] mDNS service stopped')
            } catch (e) {
                // ignore
            }
            this.service = null
        }
        if (this.bonjour) {
            try {
                this.bonjour.destroy()
            } catch (e) {
                // ignore
            }
            this.bonjour = null
        }
    }
}

// 单例
let discoveryInstance: ServiceDiscovery | null = null

export function getDiscoveryInstance(): ServiceDiscovery {
    if (!discoveryInstance) {
        discoveryInstance = new ServiceDiscovery()
    }
    return discoveryInstance
}

