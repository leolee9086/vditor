import {codeFenceAt, getCodeLanguage, indentCode, setCodeLanguage} from "../../src/ts/sv/codeCommands";

describe("source code commands", () => {
    test("language edits only its token and maps backward selection endpoints", () => {
        const text = "before\n````  js  {#keep .class}\n甲😀 <wbr>\u00a0  \n```\n````\n\n";
        const start = text.indexOf("甲"), end = text.indexOf("\n```", start);
        const change = setCodeLanguage(text, start, end, "typescript");
        expect(change.text).toBe(text.replace("  js  ", "  typescript  "));
        expect(change.start).toBe(start + "typescript".length - 2);
        expect(change.end).toBe(end + "typescript".length - 2);
        expect(getCodeLanguage(change.text, change.start, change.end)).toBe("typescript");
    });

    test("adds language before brace metadata without consuming foreign attributes", () => {
        const text = "~~~ {.numberLines startFrom=3}\ncode\n~~~";
        const at = text.indexOf("code");
        expect(setCodeLanguage(text, at, at, "c++").text).toBe(text.replace("~~~ {", "~~~ c++ {"));
        expect(getCodeLanguage(text, at, at)).toBe("");
    });

    test("empty language removes only token; invalid identifiers do not alter text", () => {
        const text = "```c# keep=1\ncode\n```";
        const at = text.indexOf("code");
        expect(setCodeLanguage(text, at, at, "").text).toBe("``` keep=1\ncode\n```");
        for (const invalid of ["two words", "js\n~~~", "x`", "<img>"]) {
            expect(() => setCodeLanguage(text, at, at, invalid)).toThrow("Invalid code language");
        }
    });

    test("outside and multiple fences refuse to edit an arbitrary language", () => {
        const text = "intro\n```js\na\n```\n~~~py\nb\n~~~\nend";
        expect(setCodeLanguage(text, 0, 2, "go")).toEqual({text, start: 0, end: 2});
        expect(setCodeLanguage(text, text.indexOf("a\n"), text.indexOf("b\n") + 1, "go").text).toBe(text);
        expect(codeFenceAt(text, text.indexOf("end"), text.length)).toBeUndefined();
    });

    test("literal quote fence inside code cannot close a parent fence", () => {
        const text = "```js\n> ```\n- [ ] example\n```\n- [ ] actual";
        expect(getCodeLanguage(text, text.indexOf("example"), text.indexOf("example"))).toBe("js");
    });

    test("unclosed fence and quote or list container exit have exact ranges", () => {
        const text = "> ```js\n> a\n- ```py\n  b\nafter";
        expect(getCodeLanguage(text, text.indexOf("> a") + 2, text.indexOf("> a") + 3)).toBe("js");
        const at = text.indexOf("  b") + 2;
        expect(getCodeLanguage(text, at, at)).toBe("py");
        expect(getCodeLanguage(text, text.indexOf("after"), text.length)).toBeUndefined();
    });

    test("whole fence selection indents content only and excludes next line", () => {
        const text = "```js\nfirst\nsecond\n```\nafter";
        const end = text.indexOf("after");
        const change = indentCode(text, 0, end, false, "  ")!;
        expect(change.text).toBe("```js\n  first\n  second\n```\nafter");
        expect(change.start).toBe(0);
        expect(change.end).toBe(end + 4);
        expect(indentCode(change.text, change.start, change.end, true, "  ")!.text).toBe(text);
    });

    test("quote and list prefixes survive reverse indentation", () => {
        const text = "> - ~~~py\n>   \tprint(1)\n>   ~~~\n";
        const start = text.indexOf("print");
        const change = indentCode(text, start, start, true)!;
        expect(change.text).toBe(text.replace("  \tprint", "  print"));
        const again = indentCode(change.text, change.start, change.end, true)!;
        expect(again.text).toBe(change.text);
        const indented = indentCode(again.text, again.start, again.end, false)!;
        expect(indented.text).toBe(text);
    });

    test("greater than symbols inside code are not extra quote containers", () => {
        const text = "```html\n> literal\n```";
        const at = text.indexOf("> literal");
        expect(indentCode(text, at, at, false, "  ")!.text).toBe(text.replace("> literal", "  > literal"));
        const quoted = "> ```html\n> > literal\n> ```";
        const inside = quoted.indexOf("> >") + 2;
        expect(indentCode(quoted, inside, inside, false, "  ")!.text).toBe(quoted.replace("> > literal", ">   > literal"));
    });

    test("empty body and fence lines do not move fence markers", () => {
        const text = "```js\n\n```";
        expect(indentCode(text, 0, 0, false)!.text).toBe(text);
        const at = text.indexOf("\n") + 1;
        expect(indentCode(text, at, at, false)!.text).toBe("```js\n\t\n```");
    });

    test("mixed outside selection falls back and deeper quote cannot close parent fence", () => {
        const text = "```js\n> ```\nx\n```\nafter";
        const at = text.indexOf("x");
        expect(getCodeLanguage(text, at, at)).toBe("js");
        expect(indentCode(text, at, text.length, false)).toBeUndefined();
    });
});
