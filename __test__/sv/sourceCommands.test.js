const {launchBrowser, useLocalVditorAssets} = require("../util/launchBrowser");

jest.setTimeout(30000);

describe("SV commands through browser input", () => {
    let browser;
    let page;
    const initial = "alpha\nbeta\nthird\n\nliteral <wbr> & NBSP\u00a0\n\n";
    const textarea = "#source-command-fixture textarea.vditor-sv";
    const button = (name) => `#source-command-fixture button[data-type="${name}"]`;
    const value = () => page.evaluate(() => window.sourceCommandEditor.getFileText());
    const select = (start = 0, end = 11, direction = "forward") => page.$eval(textarea, (element, selection) => {
        element.focus();
        element.setSelectionRange(...selection);
    }, [start, end, direction]);
    const press = async (...keys) => {
        for (const key of keys.slice(0, -1)) await page.keyboard.down(key);
        await page.keyboard.press(keys[keys.length - 1]);
        for (const key of keys.slice(0, -1).reverse()) await page.keyboard.up(key);
    };
    const selection = () => page.$eval(textarea, element => [element.selectionStart, element.selectionEnd, element.selectionDirection]);

    const mount = async () => {
        await page.waitForFunction(() => window.vditorTest);
        await page.addScriptTag({url: "http://localhost:9000/js/i18n/en_US.js"});
        await page.evaluate(async () => {
            const Vditor = window.vditorTest.constructor;
            const element = document.createElement("div");
            element.id = "source-command-fixture";
            document.body.appendChild(element);
            window.sourceCommandInputs = 0;
            window.sourceCommandEditor = await new Promise(resolve => {
                let editor;
                editor = new Vditor(element, {
                    _lutePath: "/js/lute/lute.min.js",
                    after: () => resolve(editor),
                    cache: {enable: false},
                    cdn: window.location.origin,
                    i18n: window.VditorI18n,
                    input: () => window.sourceCommandInputs++,
                    mode: "sv",
                    preview: {mode: "editor", delay: 0},
                    tab: "  ",
                    toolbar: ["headings", "undo", "redo", "bold", "italic", "list", "ordered-list",
                        "check", "task-toggle", "outdent", "indent", "quote", "line", "link", "code", "code-language", "table"],
                    toolbarConfig: {revealOnFocus: true},
                    undoDelay: 500,
                    value: "",
                });
            });
        });
    };

    beforeAll(async () => {
        browser = await launchBrowser();
        page = await browser.newPage();
        await useLocalVditorAssets(page);
        await page.goto("http://localhost:9000/jest-puppeteer.html", {waitUntil: "domcontentloaded"});
        await mount();
    });

    beforeEach(async () => {
        await page.evaluate(text => {
            window.sourceCommandEditor.enable();
            window.sourceCommandEditor.setFileText(text);
            window.sourceCommandInputs = 0;
        }, initial);
        await select();
    });

    test.each([
        ["list", "* alpha\n* beta"],
        ["ordered-list", "1. alpha\n2. beta"],
        ["check", "* [ ] alpha\n* [ ] beta"],
        ["quote", "> alpha\n> beta"],
    ])("real pointer %s preserves the half-open line range and literal text", async (name, firstLines) => {
        await page.click(button(name));
        expect(await value()).toBe(firstLines + initial.slice(10));
        await press("Control", "z");
        expect(await value()).toBe(initial);
        expect(await selection()).toEqual([0, 11, "forward"]);
        await press("Control", "Shift", "z");
        expect(await value()).toBe(firstLines + initial.slice(10));
    });

    test("rapid commands have separate Undo boundaries and restore backward selection", async () => {
        await select(0, 10, "backward");
        await page.click(button("list"));
        const listed = await value();
        await page.click(button("quote"));
        expect(await value()).not.toBe(listed);
        await press("Control", "z");
        expect(await value()).toBe(listed);
        await press("Control", "z");
        expect(await value()).toBe(initial);
        expect(await selection()).toEqual([0, 10, "backward"]);
    });

    test("visible indentation buttons and Tab share one reversible transform", async () => {
        await page.click(button("indent"));
        expect(await value()).toBe("  alpha\n  beta" + initial.slice(10));
        await page.click(button("outdent"));
        expect(await value()).toBe(initial);
        await press("Tab");
        expect(await value()).toBe("  alpha\n  beta" + initial.slice(10));
        await press("Shift", "Tab");
        expect(await value()).toBe(initial);
    });

    test("Alt+F10, Enter, heading selection and Escape retain toolbar focus", async () => {
        await press("Alt", "F10");
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-type"))).toBe("headings");
        await press("Enter");
        expect(await page.$eval("#source-command-fixture .vditor-toolbar", e => e.hasAttribute("inert"))).toBe(false);
        await press("Tab");
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-tag"))).toBe("h1");
        await press("Tab");
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-tag"))).toBe("h2");
        await press("Enter");
        expect(await value()).toBe("## alpha\n## beta" + initial.slice(10));
        await press("Alt", "F10");
        await press("Escape");
        expect(await page.$eval(textarea, e => document.activeElement === e)).toBe(true);
    });

    test("immediate typing Undo works before debounce and a new edit invalidates Redo", async () => {
        await select(5, 5);
        await page.keyboard.type("X");
        await press("Control", "z");
        expect(await value()).toBe(initial);
        await page.keyboard.type("Y");
        await press("Control", "y");
        expect(await value()).toBe(initial.slice(0, 5) + "Y" + initial.slice(5));
    });

    test("cancellable native history events use the same command history", async () => {
        await page.click(button("list"));
        const listed = await value();
        const undoCancelled = await page.$eval(textarea, e => !e.dispatchEvent(new InputEvent("beforeinput", {
            inputType: "historyUndo", bubbles: true, cancelable: true,
        })));
        expect(undoCancelled).toBe(true);
        expect(await value()).toBe(initial);
        await page.$eval(textarea, e => e.dispatchEvent(new InputEvent("beforeinput", {
            inputType: "historyRedo", bubbles: true, cancelable: true,
        })));
        expect(await value()).toBe(listed);
    });

    test("composition locks toolbar, keyboard and Undo until composition ends", async () => {
        await page.$eval(textarea, e => e.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true})));
        await press("Control", "b");
        await press("Tab");
        // 程序触发按钮也必须遵守 composingLock；真实中文候选窗仍需人工设备验收。
        await page.$eval(button("list"), e => e.click());
        await press("Control", "z");
        expect(await value()).toBe(initial);
        await page.$eval(textarea, e => e.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true})));
        await select();
        await page.click(button("list"));
        expect(await value()).toBe("* alpha\n* beta" + initial.slice(10));
    });

    test("file load resets local Undo without input and disabled mode refuses commands", async () => {
        await page.click(button("bold"));
        const result = await page.evaluate(text => {
            const editor = window.sourceCommandEditor;
            window.sourceCommandInputs = 0;
            editor.setFileText(text);
            editor.disabled();
            editor.vditor.undo.undo(editor.vditor);
            document.querySelector("#source-command-fixture button[data-type=list]").click();
            return {text: editor.getFileText(), inputs: window.sourceCommandInputs};
        }, initial);
        expect(result).toEqual({text: initial, inputs: 0});
    });

    test.each(["bold", "italic", "code", "table", "line", "link"])("%s is one reversible source edit", async name => {
        await select(0, 5);
        await page.click(button(name));
        expect(await value()).not.toBe(initial);
        await press("Control", "z");
        expect(await value()).toBe(initial);
    });

    test("task completion pointer and shortcut preserve source and backward selection", async () => {
        const text = "+ [ ] 甲😀\n12) [X] 乙  \n\nliteral <wbr> NBSP\u00a0\n\n";
        await page.evaluate(text => window.sourceCommandEditor.setFileText(text), text);
        await select(0, text.indexOf("literal"), "backward");
        const beforeSelection = await selection();
        await page.click(button("task-toggle"));
        const completed = text.replace("+ [ ]", "+ [x]");
        expect(await value()).toBe(completed);
        expect(await selection()).toEqual(beforeSelection);
        expect(await page.$eval(textarea, e => document.activeElement === e)).toBe(true);
        await press("Control", "z");
        expect(await value()).toBe(text);
        expect(await selection()).toEqual(beforeSelection);
        await press("Control", "y");
        expect(await value()).toBe(completed);
        await press("Control", "Shift", "j");
        expect(await value()).toBe(text.replace("12) [X]", "12) [ ]"));
    });

    test("task completion no-op preserves Redo and emits no input", async () => {
        await page.click(button("bold"));
        const changed = await value();
        await press("Control", "z");
        await page.evaluate(() => { window.sourceCommandInputs = 0; });
        await page.click(button("task-toggle"));
        expect(await value()).toBe(initial);
        expect(await page.evaluate(() => window.sourceCommandInputs)).toBe(0);
        await press("Control", "y");
        expect(await value()).toBe(changed);
    });

    test("task completion works through keyboard toolbar activation and refuses composition or disabled", async () => {
        const text = "* [ ] task\n";
        await page.evaluate(text => window.sourceCommandEditor.setFileText(text), text);
        await select(6, 6);
        await press("Alt", "F10");
        // Tab 到新命令，保留真实键盘焦点路径，而非程序 button.click。
        for (let i = 0; i < 8; i++) await press("Tab");
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-type"))).toBe("task-toggle");
        await press("Enter");
        expect(await value()).toBe("* [x] task\n");
        await page.$eval(textarea, e => e.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true})));
        await page.$eval(button("task-toggle"), e => e.click());
        await press("Control", "Shift", "j");
        expect(await value()).toBe("* [x] task\n");
        await page.$eval(textarea, e => e.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true})));
        await page.evaluate(() => window.sourceCommandEditor.disabled());
        await page.$eval(button("task-toggle"), e => e.click());
        expect(await value()).toBe("* [x] task\n");
    });

    test("task completion is hidden outside source mode and returns on mode switch", async () => {
        await press("Control", "Alt", "Digit7");
        expect(await page.$eval(button("task-toggle"), e => e.parentElement.style.display)).toBe("none");
        await page.$eval(button("task-toggle"), e => e.click());
        // 回源模式并装载精确文件，不能把不可见的新命令留在活动按钮列表里。
        await page.evaluate(() => {
            window.sourceCommandEditor.vditor.wysiwyg.element.focus();
        });
        await press("Control", "Alt", "Digit9");
        expect(await page.$eval(button("task-toggle"), e => e.parentElement.style.display)).not.toBe("none");
    });

    test("390px coarse-pointer taps preserve the selection and Undo", async () => {
        await page.setViewport({width: 390, height: 844, isMobile: true, hasTouch: true});
        try {
            // isMobile 切换会重载页面，必须重建 fixture 而不是触碰已经消失的 DOM。
            await mount();
            await page.evaluate(text => window.sourceCommandEditor.setFileText(text), initial);
            await select();
            const hitArea = await page.$eval(button("list"), element => {
                const rect = element.getBoundingClientRect();
                return {width: rect.width, height: rect.height};
            });
            expect(hitArea).toEqual({width: 44, height: 44});
            await page.tap(button("list"));
            expect(await value()).toBe("* alpha\n* beta" + initial.slice(10));
            await page.tap(button("undo"));
            expect(await value()).toBe(initial);
            expect(await selection()).toEqual([0, 11, "forward"]);
            await page.tap(button("check"));
            const tasks = await value();
            await page.tap(button("task-toggle"));
            expect(await value()).toBe(tasks.replace(/\[ \]/g, "[x]"));
            await page.tap(button("undo"));
            expect(await value()).toBe(tasks);
            const code = "```js\n甲😀 <wbr>\u00a0  \n```\n";
            await page.evaluate(text => window.sourceCommandEditor.setFileText(text), code);
            await select(code.indexOf("甲"), code.indexOf("\n```"), "backward");
            await page.tap(button("code-language"));
            expect(await page.$eval(".vditor-code-language input", e => document.activeElement === e)).toBe(true);
            const popup = await page.$eval(".vditor-code-language", e => { const r = e.getBoundingClientRect();
                return {left: r.left, right: r.right, width: innerWidth, position: getComputedStyle(e).position}; });
            expect(popup.position).toBe("fixed");
            expect(popup.left).toBeGreaterThanOrEqual(0);
            expect(popup.right).toBeLessThanOrEqual(popup.width);
            await page.$eval(".vditor-code-language input", e => { e.value = "python"; });
            await page.tap(".vditor-code-language button");
            expect(await value()).toBe(code.replace("```js", "```python"));
            await page.tap(button("undo"));
            expect(await value()).toBe(code);
        } finally {
            await page.setViewport({width: 800, height: 600, isMobile: false, hasTouch: false});
            await mount();
        }
    });

    test("code language panel edits exact source and one reversible transaction", async () => {
        const text = "> ~~~~  js  {.keep}\n> 甲😀 <wbr>\u00a0  \n> ~~~~\n\n";
        await page.evaluate(text => window.sourceCommandEditor.setFileText(text), text);
        const start = text.indexOf("甲"), end = text.indexOf("\n> ~~~~");
        await select(start, end, "backward");
        await page.click(button("code-language"));
        const input = ".vditor-code-language input";
        expect(await page.$eval(input, e => document.activeElement === e && e.value === "js")).toBe(true);
        await page.$eval(input, e => { e.value = "typescript"; });
        await press("Enter");
        const changed = text.replace("  js  ", "  typescript  ");
        expect(await value()).toBe(changed);
        expect(await selection()).toEqual([start + 8, end + 8, "backward"]);
        expect(await page.$eval(textarea, e => document.activeElement === e)).toBe(true);
        await press("Control", "z");
        expect(await value()).toBe(text);
        expect(await selection()).toEqual([start, end, "backward"]);
        await press("Control", "y");
        expect(await value()).toBe(changed);
    });

    test("code language keyboard entry, invalid input and Escape keep source selection", async () => {
        const text = "```js\ncode\n```";
        await page.evaluate(text => window.sourceCommandEditor.setFileText(text), text);
        await select(6, 10, "backward");
        await press("Alt", "F10");
        for (let i = 0; i < 15; i++) await press("Tab");
        expect(await page.evaluate(() => document.activeElement.getAttribute("data-type"))).toBe("code-language");
        await press("Enter");
        await page.$eval(".vditor-code-language input", e => { e.value = "two words"; });
        await press("Enter");
        expect(await page.$eval(".vditor-code-language input", e => e.getAttribute("aria-invalid"))).toBe("true");
        expect(await value()).toBe(text);
        await press("Escape");
        expect(await selection()).toEqual([6, 10, "backward"]);
        expect(await page.$eval(textarea, e => document.activeElement === e)).toBe(true);
        expect(await page.evaluate(() => window.sourceCommandInputs)).toBe(0);
    });

    test("code language outside fences, composition and disabled refuse edits", async () => {
        await page.click(button("code-language"));
        expect(await page.$eval(".vditor-code-language input", e => e.disabled)).toBe(true);
        await press("Escape");
        const text = "```js\ncode\n```";
        await page.evaluate(text => window.sourceCommandEditor.setFileText(text), text);
        await select(6, 10);
        await page.$eval(textarea, e => e.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true})));
        await page.$eval(button("code-language"), e => e.click());
        expect(await page.$eval(".vditor-code-language", e => e.style.display)).toBe("none");
        await page.$eval(textarea, e => e.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true})));
        await page.evaluate(() => window.sourceCommandEditor.disabled());
        await page.$eval(button("code-language"), e => e.click());
        expect(await value()).toBe(text);
    });

    test("language panel composition and unchanged submit preserve Redo", async () => {
        const text = "```js\ncode\n```";
        await page.evaluate(text => window.sourceCommandEditor.setFileText(text), text);
        await select(6, 10);
        await page.click(button("indent"));
        const changed = await value();
        await press("Control", "z");
        await page.evaluate(() => { window.sourceCommandInputs = 0; });
        await page.click(button("code-language"));
        const input = ".vditor-code-language input";
        await page.$eval(input, e => { e.value = "python"; e.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true})); });
        await page.click(".vditor-code-language button");
        expect(await value()).toBe(text);
        await page.$eval(input, e => { e.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true})); e.value = "js"; });
        await press("Enter");
        expect(await value()).toBe(text);
        expect(await page.evaluate(() => window.sourceCommandInputs)).toBe(0);
        await press("Control", "y");
        expect(await value()).toBe(changed);
    });

    test("Tab and toolbar indentation protect quote/list containers and fence lines", async () => {
        const text = "> - ~~~py\n>   print(1)\n>   ~~~\n";
        await page.evaluate(text => window.sourceCommandEditor.setFileText(text), text);
        await select(0, text.length, "backward");
        await press("Tab");
        const changed = text.replace("  print", "    print");
        expect(await value()).toBe(changed);
        await press("Shift", "Tab");
        expect(await value()).toBe(text);
        await page.click(button("indent"));
        expect(await value()).toBe(changed);
        await press("Control", "z");
        expect(await value()).toBe(text);
        await press("Control", "y");
        expect(await value()).toBe(changed);
    });

    afterAll(async () => {
        await browser?.close();
    });
});
