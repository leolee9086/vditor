import type {SourceChange} from "./lineCommands";
import {indentationWidth, scanSource, type SourceFence} from "./sourceScan";

export function codeFenceAt(text: string, start: number, end: number): SourceFence | undefined {
    const probe = end > start ? end - 1 : end;
    return scanSource(text).fences.find(fence => start >= fence.start &&
        (probe < fence.end || probe === text.length && fence.end === text.length));
}

/** 只改开启围栏的语言 token；尾随属性、空白和关闭围栏完全保留。无语言用空字符串表示。 */
export function setCodeLanguage(text: string, start: number, end: number, language: string): SourceChange {
    if (!/^[a-zA-Z0-9_+.#-]*$/.test(language)) throw new Error("Invalid code language");
    const fence = codeFenceAt(text, start, end);
    if (!fence) return {text, start, end};
    const newline = text.indexOf("\n", fence.markerEnd);
    const lineEnd = newline < 0 ? text.length : newline;
    const info = text.slice(fence.markerEnd, lineEnd);
    const match = /^([ \t]*)([^ \t]*)(.*)$/.exec(info)!;
    // 花括号属性不是语言名称，不让语言命令吞掉外来信息。
    const token = /^[a-zA-Z0-9_+.#-]+$/.test(match[2]) ? match[2] : "";
    const from = fence.markerEnd + match[1].length;
    const to = from + token.length;
    const insert = language + (!token && match[2] && language ? " " : "");
    const shift = insert.length - token.length;
    const map = (point: number) => point < from ? point : point <= to ? from + insert.length : point + shift;
    return {text: text.slice(0, from) + insert + text.slice(to), start: map(start), end: map(end)};
}

export function getCodeLanguage(text: string, start: number, end: number): string | undefined {
    const fence = codeFenceAt(text, start, end);
    if (!fence) return undefined;
    return /^[ \t]*([a-zA-Z0-9_+.#-]+)/.exec(text.slice(fence.markerEnd))?.[1] || "";
}

interface Edit { from: number; to: number; insert: string }

/** 返回 undefined 表示选区不属于单一围栏，让调用方继续普通行缩进。围栏行始终不参与。 */
export function indentCode(text: string, start: number, end: number, outdent: boolean, tab = "\t"): SourceChange | undefined {
    const fence = codeFenceAt(text, start, end);
    if (!fence) return undefined;
    const left = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
    const probe = end > start ? end - 1 : end;
    const newline = text.indexOf("\n", probe), right = newline < 0 ? text.length : newline;
    const edits: Edit[] = [];
    let position = Math.max(left, fence.contentStart);
    for (const line of text.slice(position, Math.min(right, fence.contentEnd)).split("\n")) {
        if (position >= fence.contentEnd || position > right) break;
        // 代码自身的 > 是字面字符，只跨过开启围栏实际所在的引用深度。
        const quote = new RegExp("^(?:[ \\t]*>[ \\t]?){0," + fence.quoteDepth + "}").exec(line)![0];
        const body = line.slice(quote.length), leading = /^[ \t]*/.exec(body)![0];
        // 引用前缀和列表容器的最小缩进不属于代码；反缩进不能把代码移出容器。
        let protectedLength = 0;
        while (protectedLength < leading.length && indentationWidth(leading.slice(0, protectedLength)) < fence.listIndent) {
            protectedLength++;
        }
        const codeIndent = leading.slice(protectedLength), from = position + quote.length + protectedLength;
        if (outdent) {
            const count = codeIndent.startsWith("\t") ? 1 : Math.min(codeIndent.length, tab === "\t" ? 4 : Math.max(1, tab.length));
            if (count) edits.push({from, to: from + count, insert: ""});
        } else if (line.trim() || left === right || start === end) {
            edits.push({from, to: from, insert: tab});
        }
        position += line.length + 1;
    }
    const map = (point: number) => {
        let shift = 0;
        for (const edit of edits) {
            if (point < edit.from) break;
            if (point < edit.to) return edit.from + shift;
            shift += edit.insert.length - (edit.to - edit.from);
        }
        return point + shift;
    };
    let cursor = 0;
    const chunks: string[] = [];
    for (const edit of edits) { chunks.push(text.slice(cursor, edit.from), edit.insert); cursor = edit.to; }
    chunks.push(text.slice(cursor));
    return {text: chunks.join(""), start: map(start), end: map(end)};
}
