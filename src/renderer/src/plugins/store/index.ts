import { createPinia } from "pinia";
import { useSettingStore } from "@renderer/plugins/store/setting";

export {
    useSettingStore,
}

const pinia = createPinia();
export default pinia;