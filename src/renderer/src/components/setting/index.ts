import { inject } from "vue";

// 设置模态框提供类型
export type settingProvider = {
    open(cb?: Function): void;
    close(): void;
}

export default function useSetting() {
    const api = inject<settingProvider | null>('useSetting', null);
    if (api === null) {
        throw new Error('useSetting must be used after setting modal provider');
    }
    return api;
};