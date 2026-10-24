import {transformLines} from "../../src/ts/sv/lineCommands";

describe("source-mode line commands", () => {
    const apply = (text: string, command: Parameters<typeof transformLines>[3], prefix = "", tab = "\t", start = 0, end = text.length) =>
        transformLines(text, start, end, command, prefix, tab);

    it("formats and toggles every selected line without changing blank lines", () => {
        const text = "第一行\n\n第三行";
        expect(apply(text, "list", "* ").text).toBe("* 第一行\n\n* 第三行");
        expect(apply("* 第一行\n\n* 第三行", "list", "* ").text).toBe(text);
        expect(apply(text, "check", "* [ ] ").text).toBe("* [ ] 第一行\n\n* [ ] 第三行");
        expect(apply(text, "quote", "> ").text).toBe("> 第一行\n\n> 第三行");
    });

    it("converts list types and preserves ordered numbering", () => {
        const text = "* 甲\n* 乙\n* 丙";
        expect(apply(text, "ordered-list", "1. ").text).toBe("1. 甲\n2. 乙\n3. 丙");
        expect(apply("9. 甲\n10. 乙", "ordered-list", "1. ").text).toBe("甲\n乙");
        expect(apply("* [x] 已完成\n* [ ] 待办", "check", "* [ ] ").text).toBe("已完成\n待办");
    });

    it("sets and removes headings on the selected lines", () => {
        const text = "普通标题\n第二行";
        expect(apply(text, "heading", "## ").text).toBe("## 普通标题\n## 第二行");
        expect(apply("## 普通标题\n## 第二行", "heading", "## ").text).toBe(text);
        expect(apply("## 普通标题", "heading", "").text).toBe("普通标题");
    });

    it("indents and outdents all selected lines while preserving their selection", () => {
        const text = "甲\n乙\n丙";
        const indented = apply(text, "indent", "", "  ", 2, 5);
        expect(indented.text).toBe("甲\n  乙\n  丙");
        expect(indented.start).toBe(4);
        expect(indented.end).toBe(9);
        const outdented = apply(indented.text, "outdent", "", "  ", indented.start, indented.end);
        expect(outdented.text).toBe(text);
        expect(outdented.start).toBe(2);
        expect(outdented.end).toBe(5);
    });

    it("does not transform the next line when selection ends at its start", () => {
        const text = "甲\n乙";
        expect(transformLines(text, 0, 2, "list", "* ").text).toBe("* 甲\n乙");
    });

    it("preserves Unicode, literal markup, metadata and blank lines outside prefixes", () => {
        const text = "  😀中文 <wbr>\u00a0\n\n{: id=\"stable-id\" custom=\"未知\"}\n\n";
        const changed = transformLines(text, 2, 14, "quote", "> ");
        expect(changed.text).toBe("  > 😀中文 <wbr>\u00a0\n\n{: id=\"stable-id\" custom=\"未知\"}\n\n");
        expect(transformLines(changed.text, changed.start, changed.end, "quote", "> ").text).toBe(text);
    });

    it("formats empty lines and preserves indentation while converting nested lists", () => {
        expect(apply("", "check", "* [ ] ")).toEqual({text: "* [ ] ", start: 6, end: 6});
        expect(apply("  * one\n    - [x] two\n  3. three", "list", "* ").text)
            .toBe("  * one\n    * two\n  * three");
        expect(apply("  > > nested", "quote", "> ").text).toBe("  > nested");
    });

    it("handles a large selected document without changing trailing blanks", () => {
        const text = "字😀\n".repeat(25000);
        const result = apply(text, "list", "* ");
        expect(result.text).toBe("* 字😀\n".repeat(25000));
        expect(result.end).toBe(result.text.length);
    });

    it("does not remove more than one indentation unit", () => {
        expect(apply("    深层", "outdent", "", "  ").text).toBe("  深层");
        expect(apply("\t深层", "outdent", "", "  ").text).toBe("深层");
        expect(apply("普通", "outdent", "", "  ").text).toBe("普通");
    });
});
