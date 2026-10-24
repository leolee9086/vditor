/** 源模式只变换选中的文本行；选区末端落在下一行行首时不包含该行。 */
export type LineCommand = "heading" | "list" | "ordered-list" | "check" | "quote" | "indent" | "outdent";
export interface SourceChange { text: string; start: number; end: number }
interface Edit { from: number; to: number; insert: string }
const marker = (line: string) => {
    const match = /^([ \t]*)(?:(\d{1,9})[.)]|[-+*])[ \t]+(?:\[([ xX])\](?:[ \t]+|$))?/.exec(line);
    return match ? { indent: match[1].length, length: match[0].length - match[1].length,
        kind: match[3] !== undefined ? "check" : match[2] ? "ordered-list" : "list", number: Number(match[2]) } : undefined;
};
export function transformLines(text: string, start: number, end: number, command: LineCommand, prefix = "", tab = "\t"): SourceChange {
    const left = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
    // 半开选区若正好包含换行符，到此为止；不能把下一行也变成列表。
    const probe = end > start ? end - 1 : end;
    const next = text.indexOf("\n", probe), right = next < 0 ? text.length : next;
    const lines = text.slice(left, right).split("\n");
    // 多行中的空白行保持原样；单独的空行仍可创建新列表项或标题。
    const active = lines.filter(line => lines.length === 1 || !/^[ \t]*$/.test(line));
    const isList = command === "list" || command === "ordered-list" || command === "check";
    const remove = active.length > 0 && active.every(line => {
        if (isList) return marker(line)?.kind === command;
        if (command === "quote") return /^[ \t]*>/.test(line);
        if (command === "heading") return (line.match(/^[ \t]*(#{1,6})[ \t]+/)?.[1] ?? "") === prefix.trim();
        return false;
    });
    const edits: Edit[] = [];
    let position = left, number = marker(active[0] ?? "")?.number || Number(/^\s*(\d+)[.)]/.exec(prefix)?.[1]) || 1;
    for (const line of lines) {
        const indentation = line.match(/^[ \t]*/)![0];
        let at = indentation.length, count = 0, insert = "";
        if (command === "indent" || command === "outdent") {
            at = 0;
            if (command === "indent") insert = lines.length === 1 || !/^[ \t]*$/.test(line) ? tab : "";
            else {
                const leading = line.match(/^[ \t]*/)?.[0] ?? "";
                if (leading.startsWith("\t")) count = 1;
                else if (leading) count = Math.min(leading.length, tab === "\t" ? 4 : Math.max(1, tab.length));
            }
        } else if (lines.length === 1 || !/^[ \t]*$/.test(line)) {
            if (isList) {
                count = marker(line)?.length ?? 0;
                if (!remove) insert = command === "ordered-list" ? `${number++}. ` : prefix || (command === "check" ? "- [ ] " : "- ");
            } else if (command === "quote") {
                count = remove ? (line.slice(at).match(/^>[ \t]?/)?.[0] ?? "").length : 0;
                insert = remove ? "" : "> ";
            } else {
                count = (line.slice(at).match(/^#{1,6}[ \t]+/)?.[0] ?? "").length;
                insert = remove ? "" : prefix;
            }
        }
        if (count || insert) edits.push({ from: position + at, to: position + at + count, insert });
        position += line.length + 1;
    }
    const map = (point: number) => {
        let shift = 0;
        for (const edit of edits) {
            if (point < edit.from) break;
            if (point < edit.to) return edit.from + shift + edit.insert.length;
            shift += edit.insert.length - (edit.to - edit.from);
        }
        return point + shift;
    };
    // 一次拼接，避免逐行重建全文在长选区内退化为平方开销。
    const chunks: string[] = [];
    let cursor = 0;
    for (const edit of edits) {
        chunks.push(text.slice(cursor, edit.from), edit.insert);
        cursor = edit.to;
    }
    chunks.push(text.slice(cursor));
    return { text: chunks.join(""), start: map(start), end: map(end) };
}
