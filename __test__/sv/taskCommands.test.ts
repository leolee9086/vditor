import {toggleTasks} from "../../src/ts/sv/taskCommands";

const all = (text: string) => toggleTasks(text, 0, text.length).text;

describe("source task completion", () => {
    test("mixed states complete without rewriting marker numbering whitespace or literal source", () => {
        const text = "- [ ] 甲😀  \n\t+ [X] 乙\u00a0\n12) [x] 丙 <wbr>\n* [ ]\n普通\n{: id=\"kept\" custom=\"未知\"}\n\n";
        expect(all(text)).toBe(text.replace("- [ ]", "- [x]").replace("* [ ]", "* [x]"));
    });

    test("all completed tasks clear together even with uppercase X", () => {
        expect(all("+ [X] first\n3. [x] second\n")).toBe("+ [ ] first\n3. [ ] second\n");
    });

    test("cursor toggles the containing line and preserves exact selection", () => {
        const text = "- [ ] first\n- [ ] second\n";
        expect(toggleTasks(text, 8, 8)).toEqual({text: "- [x] first\n- [ ] second\n", start: 8, end: 8});
    });

    test("half-open range excludes next line and trailing blank has no task", () => {
        const text = "- [ ] first\n- [x] second\n";
        const end = text.indexOf("- [x]");
        expect(toggleTasks(text, 0, end)).toEqual({text: "- [x] first\n- [x] second\n", start: 0, end});
        expect(toggleTasks(text, text.length, text.length).text).toBe(text);
    });

    test("non-task markers and inline mentions remain literal", () => {
        const text = "- ordinary\nparagraph [ ]\n- [y] value\n- [x]no-space\n- \\[ ] escaped\n\n";
        expect(all(text)).toBe(text);
    });

    test("quoted and nested task markers retain quote and indentation bytes", () => {
        expect(all("> - [ ] first\n> >  + [ ] nested\n    7) [ ] child\n"))
            .toBe("> - [x] first\n> >  + [x] nested\n    7) [x] child\n");
    });

    test("backtick and tilde code fences are ignored even when selection starts inside", () => {
        const text = "```md\n- [ ] example\n~~~\n```\n- [ ] real\n~~~md\n+ [x] example\n~~~\n";
        expect(all(text)).toBe(text.replace("- [ ] real", "- [x] real"));
        const at = text.indexOf("example");
        expect(toggleTasks(text, at, at).text).toBe(text);
    });

    test("shorter fence and backtick fence with info do not close a longer fence", () => {
        const text = "````md\n```\n- [ ] code\n````no-close\n- [ ] code2\n````\n- [ ] real";
        expect(all(text)).toBe(text.replace("- [ ] real", "- [x] real"));
    });

    test("unclosed document fence protects all later lines", () => {
        const text = "- [ ] real\n```\n- [ ] code\n";
        expect(all(text)).toBe(text.replace("- [ ] real", "- [x] real"));
    });

    test("quote exit and list dedent terminate container code fences", () => {
        const text = "> ~~~md\n> - [ ] code\n- [ ] outside\n- ```md\n  - [ ] code2\n- [ ] after-list\n";
        expect(all(text)).toBe(text.replace("- [ ] outside", "- [x] outside").replace("- [ ] after-list", "- [x] after-list"));
    });

    test("tab-indented list fence closes only on matching delimiter", () => {
        const text = "+ ```md\n\t- [ ] sample\n  ```\n- [ ] real";
        expect(all(text)).toBe(text.replace("- [ ] real", "- [x] real"));
    });

    test("large selection transforms every task without changing offsets", () => {
        const text = Array.from({length: 25000}, (_, i) => `- [ ] item ${i}`).join("\n");
        const change = toggleTasks(text, 0, text.length);
        expect(change.text.match(/\[x\]/g)).toHaveLength(25000);
        expect(change.start).toBe(0);
        expect(change.end).toBe(text.length);
        expect(change.text.length).toBe(text.length);
    });
});
