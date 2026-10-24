import {isCtrl} from "../util/compatibility";
import {processIndent} from "./process";

export const processKeydown = (vditor: IVditor, event: KeyboardEvent) => {
    vditor.sv.composingLock = event.isComposing;
    if (event.isComposing) {
        return false;
    }

    if (event.key.indexOf("Arrow") === -1 && event.key !== "Meta" && event.key !== "Control" && event.key !== "Alt" &&
        event.key !== "Shift" && event.key !== "CapsLock" && event.key !== "Escape" && !/^F\d{1,2}$/.test(event.key)) {
        vditor.undo.recordFirstPosition(vditor, event);
    }

    if (event.key !== "Tab" || isCtrl(event) || event.altKey) {
        return false;
    }

    processIndent(vditor, event.shiftKey);
    event.preventDefault();
    return true;
};
