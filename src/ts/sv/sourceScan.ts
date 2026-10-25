import {zodCalibur, zodState} from "calibur-router/zod";

export interface TaskMarker { state: number; checked: boolean }
export interface SourceFence {
    character: string; length: number; quoteDepth: number; listIndent: number;
    start: number; markerEnd: number; contentStart: number; contentEnd: number; end: number;
}
interface LineContext {
    body: string; quoteDepth: number; sourceOffset: number; offset: number; lineEnd: number;
    opening: RegExpExecArray | string[] | null; listIndent: number;
    fence: SourceFence | undefined; tasks: TaskMarker[]; fences: SourceFence[];
}

export const indentationWidth = (indent: string) => indent.split("").reduce((column, character) =>
    character === "\t" ? column + 4 - column % 4 : column + 1, 0);

const closeFence = (line: LineContext): undefined => {
    line.fences.push({...line.fence!, contentEnd: line.offset, end: line.lineEnd + 1});
    return undefined;
};
const keepFence = (line: LineContext): SourceFence | undefined => line.fence;
const openFence = (line: LineContext): SourceFence => ({
    character: line.opening![1][0], length: line.opening![1].length,
    quoteDepth: line.quoteDepth, listIndent: line.listIndent,
    start: line.offset, markerEnd: line.sourceOffset + line.body.indexOf(line.opening![1]) + line.opening![1].length,
    contentStart: line.lineEnd + 1, contentEnd: line.lineEnd + 1, end: line.lineEnd,
});
const collectTask = (line: LineContext): undefined => {
    const match = /^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+\[([ xX])\](?:[ \t]+|$)/.exec(line.body);
    if (match) line.tasks.push({state: line.sourceOffset + match[0].indexOf("[") + 1, checked: match[1] !== " "});
    return undefined;
};

// 任务与代码命令共用一套有限状态，避免两份围栏解析器对相同原文得出不同边界。
const dispatchLine = zodCalibur.universe(zodState.object({
    fenced: zodState.boolean(), closes: zodState.boolean(), opens: zodState.boolean(),
}))
    .split(zodState.object({fenced: zodState.literal(true), closes: zodState.literal(true)}), () => closeFence)
    .split(zodState.object({fenced: zodState.literal(true), closes: zodState.literal(false)}), () => keepFence)
    .split(zodState.object({fenced: zodState.literal(false), opens: zodState.literal(true)}), () => openFence)
    .remain(() => collectTask)
    .build();

/** 扫描结果全部指向原文 UTF-16 位置，不重排或规范化 Markdown。 */
export function scanSource(text: string): {tasks: TaskMarker[]; fences: SourceFence[]} {
    const tasks: TaskMarker[] = [], fences: SourceFence[] = [];
    let offset = 0, fence: SourceFence | undefined;
    for (const line of text.split("\n")) {
        // 围栏内只消耗真实引用容器，代码自身的 > 不应被当成新容器。
        let quotePrefix = (fence ? new RegExp("^(?:[ \\t]*>[ \\t]?){0," + fence.quoteDepth + "}") :
            /^(?:[ \t]*>[ \t]?)*/).exec(line)![0];
        let quoteDepth = (quotePrefix.match(/>/g) || []).length;
        let body = line.slice(quotePrefix.length);
        const indentation = /^[ \t]*/.exec(body)![0];
        // 离开引用或列表容器，未闭合围栏也在当前行之前结束。
        if (fence && (quoteDepth < fence.quoteDepth || (body.trim() && indentationWidth(indentation) < fence.listIndent))) {
            fences.push({...fence, contentEnd: offset, end: offset});
            fence = undefined;
            quotePrefix = /^(?:[ \t]*>[ \t]?)*/.exec(line)![0];
            quoteDepth = (quotePrefix.match(/>/g) || []).length;
            body = line.slice(quotePrefix.length);
        }
        const delimiter = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(body);
        const listDelimiter = /^([ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+)(`{3,}|~{3,})(.*)$/.exec(body);
        const opening = listDelimiter ? [listDelimiter[0], listDelimiter[2], listDelimiter[3]] : delimiter;
        const closes = !!(fence && delimiter && quoteDepth === fence.quoteDepth &&
            delimiter[1][0] === fence.character && delimiter[1].length >= fence.length && /^[ \t]*$/.test(delimiter[2]));
        const opens = !!(opening && !(opening[1][0] === "`" && opening[2].includes("`")));
        const handle = dispatchLine({fenced: !!fence, closes, opens});
        fence = handle({body, quoteDepth, sourceOffset: offset + quotePrefix.length, offset, lineEnd: offset + line.length,
            opening, listIndent: listDelimiter ? indentationWidth(listDelimiter[1]) : 0, fence, tasks, fences});
        offset += line.length + 1;
    }
    if (fence) fences.push({...fence, contentEnd: text.length, end: text.length});
    return {tasks, fences};
}
