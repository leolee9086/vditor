import {Constants} from "../constants";
import {getCodeLanguage} from "../sv/codeCommands";
import {processCodeLanguage} from "../sv/process";
import {getEventName} from "../util/compatibility";
import {MenuItem} from "./MenuItem";
import {hidePanel} from "./setToolbar";

/** 只编辑当前源围栏的语言。选区和变换属于编辑器，文件宿主无需识别代码语法。 */
export class CodeLanguage extends MenuItem {
    constructor(vditor: IVditor, menuItem: IMenuItem) {
        const message = (name: string, fallback: string) => window.VditorI18n[name] || fallback;
        const title = message("code-language", "Code language");
        super(vditor, {...menuItem, tip: menuItem.tip || title});
        const button = this.element.firstElementChild as HTMLButtonElement;
        const panel = document.createElement("div"), label = document.createElement("label");
        const input = document.createElement("input"), apply = document.createElement("button");
        const cancel = document.createElement("button"), status = document.createElement("p");
        panel.className = "vditor-hint vditor-panel--arrow vditor-code-language";
        panel.setAttribute("role", "group"); panel.setAttribute("aria-label", title);
        input.type = "text"; input.maxLength = 64; input.autocomplete = "off"; input.spellcheck = false;
        input.setAttribute("aria-label", title);
        input.placeholder = "javascript / python / c++";
        label.append(document.createTextNode(title), input);
        apply.type = "button"; cancel.type = "button";
        apply.textContent = message("code-language-apply", "Apply language");
        cancel.textContent = message("cancel", "Cancel");
        status.setAttribute("role", "status");
        panel.append(label, apply, cancel, status); this.element.appendChild(panel);
        let composing = false;
        input.addEventListener("compositionstart", () => { composing = true; });
        input.addEventListener("compositionend", () => { composing = false; });
        let selection: {start: number; end: number; direction: "forward" | "backward" | "none"; text: string};
        const close = () => {
            panel.style.display = "none";
            vditor.sv.element.focus();
            if (selection && vditor.sv.element.value === selection.text) {
                vditor.sv.element.setSelectionRange(selection.start, selection.end, selection.direction);
            }
        };
        button.addEventListener(getEventName(), (event) => {
            event.preventDefault();
            const source = vditor.sv.element;
            if (vditor.currentMode !== "sv" || source.disabled || vditor.sv.composingLock ||
                button.classList.contains(Constants.CLASS_MENU_DISABLED)) return;
            selection = {start: source.selectionStart, end: source.selectionEnd,
                direction: source.selectionDirection, text: source.value};
            const language = getCodeLanguage(source.value, selection.start, selection.end);
            hidePanel(vditor, ["subToolbar", "hint"]);
            panel.style.display = "block";
            composing = false; input.removeAttribute("aria-invalid");
            input.value = language || ""; input.disabled = language === undefined; apply.disabled = language === undefined;
            status.textContent = language === undefined ? message("code-language-unavailable", "Place the cursor in one fenced code block") :
                message("code-language-empty", "Leave empty for plain code");
            if (input.disabled) cancel.focus();
            else { input.focus(); input.select(); }
        });
        const submit = () => {
            if (!selection || input.disabled || composing || vditor.sv.composingLock || vditor.sv.element.disabled) return;
            if (vditor.sv.element.value !== selection.text) {
                status.textContent = message("code-language-stale", "Source changed; reopen this panel");
                return;
            }
            if (!/^[a-zA-Z0-9_+.#-]*$/.test(input.value)) {
                status.textContent = message("code-language-invalid", "Use a single language identifier");
                input.setAttribute("aria-invalid", "true"); return;
            }
            input.removeAttribute("aria-invalid");
            processCodeLanguage(vditor, input.value, selection.start, selection.end, selection.direction);
            close();
        };
        apply.addEventListener(getEventName(), (event) => { event.preventDefault(); submit(); });
        cancel.addEventListener(getEventName(), (event) => { event.preventDefault(); close(); });
        panel.addEventListener("keydown", (event) => {
            // 语言框输入不应触发正文或宿主快捷键；组合候选键交给输入法。
            event.stopPropagation();
            if (event.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter" && event.target === input) { event.preventDefault(); submit(); }
            if (event.key === "Escape") { event.preventDefault(); close(); }
        });
    }
}
