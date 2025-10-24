import { createPinia } from "pinia";
import { useSettingStore } from "@renderer/plugins/store/setting";

export {
    useSettingStore,
    pinia
}

const pinia = createPinia();
export default pinia;