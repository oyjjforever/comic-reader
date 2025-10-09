// renderer.js (渲染进程)
const DLNACasts = require('dlnacasts');

class DLNAManager {
  constructor() {
    this.dlnacasts = null;
    this.devices = [];
    this.init();
  }

  init() {
    // 创建 dlnacasts 实例
    this.dlnacasts = DLNACasts();
    
    // 监听设备发现
    this.dlnacasts.on('update', (device) => {
      console.log('all players: ', dlnacasts.players)
      this.handleDeviceUpdate(device);
    });
    this.dlnacasts.update()
  }

  handleDeviceUpdate(device) {
    // 检查是否已存在该设备
    const existingIndex = this.devices.findIndex(d => d.name === device.name);
    
    if (existingIndex >= 0) {
      // 更新现有设备
      this.devices[existingIndex] = device;
    } else {
      // 添加新设备
      this.devices.push(device);
      console.log('发现新设备:', device.name);
    }
    console.log("🚀 ~ DLNAManager ~ handleDeviceUpdate ~ this.devices:", this.devices)
    
    // 更新UI中的设备列表
    this.updateDeviceList();
  }

  updateDeviceList() {
    // 获取UI中的设备选择元素
    const deviceSelect = document.getElementById('device-select');
    if (!deviceSelect) return;

    // 清空现有选项
    deviceSelect.innerHTML = '<option value="">选择投影仪...</option>';
    
    // 添加发现的设备
    this.devices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.name;
      option.textContent = `${device.name} (${device.host})`;
      option.dataset.deviceName = device.name;
      deviceSelect.appendChild(option);
    });
  }

  // 根据名称获取设备对象
  getDeviceByName(name) {
    return this.devices.find(device => device.name === name);
  }

  // 开始搜索设备
  startSearch() {
    console.log('开始搜索DLNA设备...');
    this.devices = []; // 清空设备列表
    this.updateDeviceList();
  }

  // 停止搜索
  stopSearch() {
    if (this.dlnacasts) {
      // dlnacasts 会持续监听，这里可以做一些清理工作
    }
  }
}

// 初始化 DLNA 管理器
// const dlnaManager = new DLNAManager();
export default DLNAManager