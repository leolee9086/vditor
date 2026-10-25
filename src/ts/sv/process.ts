import {getMarkdown} from "../markdown/getMarkdown";
import {accessLocalStorage} from "../util/compatibility";
import {transformLines, type LineCommand} from "./lineCommands";
import {toggleTasks} from "./taskCommands";
import {indentCode, setCodeLanguage} from "./codeCommands";

/** 完成状态属于编辑器，不要求文件适配器提供任务、UUID 或命令接口。 */
export const processTaskToggle = (vditor: IVditor) => {
    const element = vditor.sv.element;
    if (vditor.currentMode !== "sv" || vditor.sv.composingLock || element.disabled) return;
    const direction = element.selectionDirection;
    const change = toggleTasks(element.value, element.selectionStart, element.selectionEnd);
    // 没有任务时不通知 input，也不打断已有 Redo 分支。
    if (change.text === element.value || !beginCommand(vditor)) return;
    element.value = change.text;
    element.setSelectionRange(change.start, change.end, direction);
    finishCommand(vditor);
};

/** 语言输入框保留打开时的源选区，提交后由同一本地撤销事务恢复。 */
export const processCodeLanguage = (vditor: IVditor, language: string, start: number, end: number,
    direction: "forward" | "backward" | "none") => {
    const element = vditor.sv.element;
    if (vditor.currentMode !== "sv" || vditor.sv.composingLock || element.disabled) return false;
    const change = setCodeLanguage(element.value, start, end, language);
    if (change.text === element.value) return false;
    element.setSelectionRange(start, end, direction);
    if (!beginCommand(vditor)) return false;
    element.value = change.text;
    element.setSelectionRange(change.start, change.end, direction);
    finishCommand(vditor);
    return true;
};

const beginCommand = (vditor: IVditor) => {
    if (vditor.sv.composingLock || vditor.sv.element.disabled) return false;
    clearTimeout(vditor.sv.processTimeoutId);
    vditor.undo.addToUndoStack(vditor);
    return true;
};

const finishCommand = (vditor: IVditor) => {
    vditor.sv.element.focus();
    processAfterRender(vditor, {enableAddUndoStack: false, enableHint: false, enableInput: true});
    vditor.undo.addToUndoStack(vditor);
};

export const replaceSelection = (vditor: IVditor, text: string, selectionMode: SelectionMode = "end") => {
    const element = vditor.sv.element;
    element.setRangeText(text, element.selectionStart, element.selectionEnd, selectionMode);
    element.focus();
};

export const processPaste = (vditor: IVditor, text: string) => {
    replaceSelection(vditor, text);
};

export const processAfterRender = (vditor: IVditor, options = {
    enableAddUndoStack: true,
    enableHint: false,
    enableInput: true,
}) => {
    vditor.preview.render(vditor);

    const text = getMarkdown(vditor);
    if (typeof vditor.options.input === "function" && options.enableInput) {
        vditor.options.input(text);
    }

    if (vditor.options.counter.enable) {
        vditor.counter.render(vditor, text);
    }

    if (vditor.options.cache.enable && accessLocalStorage()) {
        localStorage.setItem(vditor.options.cache.id, text);
        if (vditor.options.cache.after) {
            vditor.options.cache.after(text);
        }
    }

    if (vditor.devtools) {
        vditor.devtools.renderEchart(vditor);
    }

    clearTimeout(vditor.sv.processTimeoutId);
    vditor.sv.processTimeoutId = window.setTimeout(() => {
        if (options.enableAddUndoStack && !vditor.sv.composingLock) {
            vditor.undo.addToUndoStack(vditor);
        }
    }, vditor.options.undoDelay);
};

export const processHeading = (vditor: IVditor, value: string) => {
    if (!beginCommand(vditor)) return;
    const element = vditor.sv.element;
    const direction = element.selectionDirection;
    const change = transformLines(element.value, element.selectionStart, element.selectionEnd, "heading", value);
    element.value = change.text;
    element.setSelectionRange(change.start, change.end, direction);
    finishCommand(vditor);
};

export const processToolbar = (vditor: IVditor, actionBtn: Element, prefix: string, suffix: string) => {
    if (!beginCommand(vditor)) return;
    const element = vditor.sv.element;
    const direction = element.selectionDirection;
    const commandName = actionBtn.getAttribute("data-type");
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (commandName === "indent" || commandName === "outdent") {
        const change = transformLines(element.value, start, end, commandName, "", vditor.options.tab);
        element.value = change.text;
        element.setSelectionRange(change.start, change.end, direction);
    } else if (commandName === "list" || commandName === "ordered-list" || commandName === "check" || commandName === "quote") {
        const change = transformLines(element.value, start, end, commandName as LineCommand, prefix, vditor.options.tab);
        element.value = change.text;
        element.setSelectionRange(change.start, change.end, direction);
    } else if (commandName === "line") {
        const text = `${start === 0 ? "" : "\n\n"}${prefix}\n`;
        element.setRangeText(text, start, end, "end");
    } else if (commandName === "code") {
        const selectedText = element.value.substring(start, end);
        element.setRangeText(`${prefix}\n${selectedText}${suffix}`, start, end, "end");
        const selectionStart = start + prefix.length + 1;
        element.setSelectionRange(selectionStart, selectionStart + selectedText.length);
    } else if (commandName === "table") {
        element.setRangeText(`${start === 0 ? "" : "\n\n"}${prefix}${suffix}`, start, end, "end");
    } else {
        const selectedText = element.value.substring(start, end);
        const selectionStart = start + prefix.length;
        element.setRangeText(`${prefix}${selectedText}${suffix}`, start, end, "end");
        element.setSelectionRange(selectionStart, selectionStart + selectedText.length);
    }
    finishCommand(vditor);
};
export const processIndent = (vditor: IVditor, outdent: boolean) => {
    const element = vditor.sv.element;
    if (vditor.sv.composingLock || element.disabled) return;
    const direction = element.selectionDirection;
    const change = indentCode(element.value, element.selectionStart, element.selectionEnd, outdent, vditor.options.tab) ||
        transformLines(element.value, element.selectionStart, element.selectionEnd,
            outdent ? "outdent" : "indent", "", vditor.options.tab);
    if (change.text === element.value || !beginCommand(vditor)) return;
    element.value = change.text;
    element.setSelectionRange(change.start, change.end, direction);
    finishCommand(vditor);
};
