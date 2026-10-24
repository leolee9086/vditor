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
                        "check", "outdent", "indent", "quote", "line", "link", "code", "table"],
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
        } finally {
            await page.setViewport({width: 800, height: 600, isMobile: false, hasTouch: false});
        }
    });

    afterAll(async () => {
        await browser?.close();
    });
});
