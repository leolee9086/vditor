import {Constants} from "../constants";
import {processTaskToggle} from "../sv/process";
import {getEventName} from "../util/compatibility";
import {MenuItem} from "./MenuItem";

/** 源文本中的任务完成操作；和“转换为任务列表”分开，避免误删任务标记。 */
export class TaskToggle extends MenuItem {
    constructor(vditor: IVditor, menuItem: IMenuItem) {
        // 文案在真实按钮创建时解析，纯配置合并不依赖浏览器全局变量。
        super(vditor, {...menuItem, tip: menuItem.tip || window.VditorI18n["task-toggle"] || "Toggle task completion"});
        const button = this.element.firstElementChild as HTMLButtonElement;
        button.setAttribute("aria-keyshortcuts", "Control+Shift+J Meta+Shift+J");
        button.addEventListener(getEventName(), (event) => {
            event.preventDefault();
            if (button.classList.contains(Constants.CLASS_MENU_DISABLED)) return;
            processTaskToggle(vditor);
        });
    }
}
