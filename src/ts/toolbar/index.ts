import {getEventName} from "../util/compatibility";
import {Both} from "./Both";
import {Br} from "./Br";
import {CodeTheme} from "./CodeTheme";
import {ContentTheme} from "./ContentTheme";
import {Counter} from "./Counter";
import {Custom} from "./Custom";
import {Devtools} from "./Devtools";
import {Divider} from "./Divider";
import {EditMode} from "./EditMode";
import {Emoji} from "./Emoji";
import {Export} from "./Export";
import {Fullscreen} from "./Fullscreen";
import {Headings} from "./Headings";
import {Help} from "./Help";
import {Indent} from "./Indent";
import {Info} from "./Info";
import {InsertAfter} from "./InsertAfter";
import {InsertBefore} from "./InsertBefore";
import {MenuItem} from "./MenuItem";
import {Outdent} from "./Outdent";
import {Outline} from "./Outline";
import {Preview} from "./Preview";
import {Record} from "./Record";
import {Redo} from "./Redo";
import {hidePanel, toggleSubMenu} from "./setToolbar";
import {Undo} from "./Undo";
import {TaskToggle} from "./TaskToggle";
import {Upload} from "./Upload";

export class Toolbar {
    public elements: { [key: string]: HTMLElement };
    public element: HTMLElement;
    private removeFocusListeners?: () => void;

    constructor(vditor: IVditor) {
        const options = vditor.options;
        this.elements = {};

        this.element = document.createElement("div");
        this.element.className = "vditor-toolbar";

        options.toolbar.forEach((menuItem: IMenuItem, i: number) => {
            const itemElement = this.genItem(vditor, menuItem, i);
            this.element.appendChild(itemElement);
            if (menuItem.toolbar) {
                const panelElement = document.createElement("div");
                panelElement.className = "vditor-hint vditor-panel--arrow";
                panelElement.addEventListener(getEventName(), (event) => {
                    panelElement.style.display = "none";
                });
                menuItem.toolbar.forEach((subMenuItem: IMenuItem, subI: number) => {
                    subMenuItem.level = 2;
                    panelElement.appendChild(this.genItem(vditor, subMenuItem, i + subI));
                });
                itemElement.appendChild(panelElement);
                toggleSubMenu(vditor, panelElement, itemElement.children[0], 2);
            }
        });

        if (vditor.options.toolbarConfig.hide && !vditor.options.toolbarConfig.revealOnFocus) {
            this.element.classList.add("vditor-toolbar--hide");
        }
        this.configureFocus(vditor);
        if (vditor.options.toolbarConfig.pin) {
            this.element.classList.add("vditor-toolbar--pin");
        }

        if (vditor.options.counter.enable) {
            vditor.counter = new Counter(vditor);
            this.element.appendChild(vditor.counter.element);
        }
    }

    public updateConfig(vditor: IVditor, options: IToolbarConfig) {
        vditor.options.toolbarConfig = Object.assign({
            hide: false,
            pin: false,
            revealOnFocus: false,
        }, options);
        this.configureFocus(vditor);
        if (vditor.options.toolbarConfig.hide && !vditor.options.toolbarConfig.revealOnFocus) {
            this.element.classList.add("vditor-toolbar--hide");
        } else {
            this.element.classList.remove("vditor-toolbar--hide");
        }
        if (vditor.options.toolbarConfig.pin) {
            this.element.classList.add("vditor-toolbar--pin");
        } else {
            this.element.classList.remove("vditor-toolbar--pin");
        }
    }

    private configureFocus(vditor: IVditor) {
        this.destroy();
        const root = vditor.element;
        root.classList.toggle("vditor--focus-toolbar", !!vditor.options.toolbarConfig.revealOnFocus);
        [vditor.sv.element, vditor.ir.element, vditor.wysiwyg.element].forEach((editor) => {
            if (vditor.options.toolbarConfig.revealOnFocus) editor.setAttribute("aria-keyshortcuts", "Alt+F10");
            else editor.removeAttribute("aria-keyshortcuts");
        });
        if (!vditor.options.toolbarConfig.revealOnFocus) {
            this.element.removeAttribute("inert");
            return;
        }
        // 焦点属于整个编辑器，进入工具栏或其弹层时仍保持展开。
        // inert 让折叠按钮同时退出 Tab 顺序及辅助技术树，避免不可见控件获焦。
        const sync = () => this.element.toggleAttribute("inert", !root.contains(document.activeElement));
        const blur = (event: FocusEvent) => {
            // 浏览器在 focusout 与 focusin 之间可能执行微任务，不能把内部 Tab 目标先设为 inert。
            if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
            queueMicrotask(sync);
        };
        // SVG 子节点的默认鼠标行为可能把焦点移到 body，导致 click 前工具栏已折叠。
        const preserveFocus = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest("button")) event.preventDefault();
        };
        // Tab 保留原有正文缩进；Alt+F10 采用常见编辑器约定进入工具栏。
        const keydown = (event: KeyboardEvent) => {
            if (event.isComposing || event.keyCode === 229) return;
            if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === "F10") {
                const button = this.element.querySelector<HTMLButtonElement>("button:not(:disabled):not(.vditor-menu--disabled)");
                if (button) { event.preventDefault(); event.stopPropagation(); button.focus(); }
            } else if (event.key === "Escape" && this.element.contains(document.activeElement)) {
                event.preventDefault(); event.stopPropagation();
                hidePanel(vditor, ["subToolbar", "hint", "popover"]);
                vditor[vditor.currentMode].element.focus();
            }
        };
        this.element.addEventListener("mousedown", preserveFocus);
        root.addEventListener("focusin", sync);
        root.addEventListener("focusout", blur);
        root.addEventListener("keydown", keydown, true);
        this.removeFocusListeners = () => {
            this.element.removeEventListener("mousedown", preserveFocus);
            root.removeEventListener("focusin", sync);
            root.removeEventListener("focusout", blur);
            root.removeEventListener("keydown", keydown, true);
        };
        sync();
    }

    public destroy() {
        this.removeFocusListeners?.();
        this.removeFocusListeners = undefined;
    }

    private genItem(vditor: IVditor, menuItem: IMenuItem, index: number) {
        let menuItemObj;
        switch (menuItem.name) {
            case "bold":
            case "italic":
            case "more":
            case "strike":
            case "line":
            case "quote":
            case "list":
            case "ordered-list":
            case "check":
            case "code":
            case "inline-code":
            case "link":
            case "table":
                menuItemObj = new MenuItem(vditor, menuItem);
                break;
            case "task-toggle":
                menuItemObj = new TaskToggle(vditor, menuItem);
                break;
            case "emoji":
                menuItemObj = new Emoji(vditor, menuItem);
                break;
            case "headings":
                menuItemObj = new Headings(vditor, menuItem);
                break;
            case "|":
                menuItemObj = new Divider();
                break;
            case "br":
                menuItemObj = new Br();
                break;
            case "undo":
                menuItemObj = new Undo(vditor, menuItem);
                break;
            case "redo":
                menuItemObj = new Redo(vditor, menuItem);
                break;
            case "help":
                menuItemObj = new Help(vditor, menuItem);
                break;
            case "both":
                menuItemObj = new Both(vditor, menuItem);
                break;
            case "preview":
                menuItemObj = new Preview(vditor, menuItem);
                break;
            case "fullscreen":
                menuItemObj = new Fullscreen(vditor, menuItem);
                break;
            case "upload":
                menuItemObj = new Upload(vditor, menuItem);
                break;
            case "record":
                menuItemObj = new Record(vditor, menuItem);
                break;
            case "info":
                menuItemObj = new Info(vditor, menuItem);
                break;
            case "edit-mode":
                menuItemObj = new EditMode(vditor, menuItem);
                break;
            case "devtools":
                menuItemObj = new Devtools(vditor, menuItem);
                break;
            case "outdent":
                menuItemObj = new Outdent(vditor, menuItem);
                break;
            case "indent":
                menuItemObj = new Indent(vditor, menuItem);
                break;
            case "outline":
                menuItemObj = new Outline(vditor, menuItem);
                break;
            case "insert-after":
                menuItemObj = new InsertAfter(vditor, menuItem);
                break;
            case "insert-before":
                menuItemObj = new InsertBefore(vditor, menuItem);
                break;
            case "code-theme":
                menuItemObj = new CodeTheme(vditor, menuItem);
                break;
            case "content-theme":
                menuItemObj = new ContentTheme(vditor, menuItem);
                break;
            case "export":
                menuItemObj = new Export(vditor, menuItem);
                break;
            default:
                menuItemObj = new Custom(vditor, menuItem);
                break;
        }

        if (!menuItemObj) {
            return;
        }
        menuItemObj.element.querySelectorAll("button").forEach((button) => {
            button.setAttribute("type", "button");
        });
        let key = menuItem.name;
        if (key === "br" || key === "|") {
            key = key + index;
        }

        this.elements[key] = menuItemObj.element;
        return menuItemObj.element;
    }
}
