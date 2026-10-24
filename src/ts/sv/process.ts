import {getMarkdown} from "../markdown/getMarkdown";
import {accessLocalStorage} from "../util/compatibility";
import {transformLines, type LineCommand} from "./lineCommands";

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
    if (!beginCommand(vditor)) return;
    const element = vditor.sv.element;
    const direction = element.selectionDirection;
    const change = transformLines(element.value, element.selectionStart, element.selectionEnd,
        outdent ? "outdent" : "indent", "", vditor.options.tab);
    element.value = change.text;
    element.setSelectionRange(change.start, change.end, direction);
    finishCommand(vditor);
};
