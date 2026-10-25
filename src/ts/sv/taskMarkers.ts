import {zodCalibur, zodState} from "calibur-router/zod";

export interface TaskMarker { state: number; checked: boolean }
interface Fence { character: string; length: number; quoteDepth: number; listIndent: number }
interface LineContext {
    body: string;
    quoteDepth: number;
    sourceOffset: number;
    opening: RegExpExecArray | string[] | null;
    listIndent: number;
    fence: Fence | undefined;
    tasks: TaskMarker[];
}

const indentationWidth = (indent: string) => indent.split("").reduce((column, character) =>
    character === "\t" ? column + 4 - column % 4 : column + 1, 0);

const closeFence = (_line: LineContext): Fence | undefined => undefined;
const keepFence = (line: LineContext): Fence | undefined => line.fence;
const openFence = (line: LineContext): Fence => ({
    character: line.opening![1][0],
    length: line.opening![1].length,
    quoteDepth: line.quoteDepth,
    listIndent: line.listIndent,
});
const collectTask = (line: LineContext): undefined => {
    const match = /^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+\[([ xX])\](?:[ \t]+|$)/.exec(line.body);
    if (match) {
        line.tasks.push({state: line.sourceOffset + match[0].indexOf("[") + 1, checked: match[1] !== " "});
    }
    return undefined;
};

// 原文与位置留在扫描上下文，路由只切分有限控制状态；不把文本解析伪装成任意谓词模式。
// 围栏内部只允许关闭或跳过，外部只允许开启或读取任务，四个处理空间互斥且穷尽。
const dispatchLine = zodCalibur.universe(zodState.object({
    fenced: zodState.boolean(),
    closes: zodState.boolean(),
    opens: zodState.boolean(),
}))
    .split(zodState.object({fenced: zodState.literal(true), closes: zodState.literal(true)}), () => closeFence)
    .split(zodState.object({fenced: zodState.literal(true), closes: zodState.literal(false)}), () => keepFence)
    .split(zodState.object({fenced: zodState.literal(false), opens: zodState.literal(true)}), () => openFence)
    .remain(() => collectTask)
    .build();

/** 只返回任务状态字符的位置；不规范化编号、标记、缩进或正文。 */
export function taskMarkers(text: string): TaskMarker[] {
    const tasks: TaskMarker[] = [];
    let offset = 0;
    let fence: Fence | undefined;
    for (const line of text.split("\n")) {
        // 去掉引用容器仅用于识别，所有位置仍指向未修改的原文。
        const quotePrefix = /^(?:[ \t]*>[ \t]?)*/.exec(line)![0];
        const quoteDepth = (quotePrefix.match(/>/g) || []).length;
        const body = line.slice(quotePrefix.length);
        const indentation = /^[ \t]*/.exec(body)![0];
        // 离开原引用或列表容器时，未闭合围栏也在当前行之前结束。
        if (fence && (quoteDepth < fence.quoteDepth || (body.trim() && indentationWidth(indentation) < fence.listIndent))) {
            fence = undefined;
        }
        const delimiter = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(body);
        const listDelimiter = /^([ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+)(`{3,}|~{3,})(.*)$/.exec(body);
        const opening = listDelimiter ? [listDelimiter[0], listDelimiter[2], listDelimiter[3]] : delimiter;
        const closes = !!(fence && delimiter && delimiter[1][0] === fence.character &&
            delimiter[1].length >= fence.length && /^[ \t]*$/.test(delimiter[2]));
        const opens = !!(opening && !(opening[1][0] === "`" && opening[2].includes("`")));
        const handle = dispatchLine({fenced: !!fence, closes, opens});
        fence = handle({body, quoteDepth, sourceOffset: offset + quotePrefix.length, opening,
            listIndent: listDelimiter ? indentationWidth(listDelimiter[1]) : 0, fence, tasks});
        offset += line.length + 1;
    }
    return tasks;
}
