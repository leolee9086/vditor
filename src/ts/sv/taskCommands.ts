import type {SourceChange} from "./lineCommands";
import {taskMarkers} from "./taskMarkers";

/** 未勾选或混合任务统一完成；全部已完成则统一取消。普通行和 fenced code 不参与。 */
export function toggleTasks(text: string, start: number, end: number): SourceChange {
    const left = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
    const probe = end > start ? end - 1 : end;
    const newline = text.indexOf("\n", probe);
    const right = newline < 0 ? text.length : newline;
    const tasks = taskMarkers(text).filter(task => task.state >= left && task.state < right);
    if (tasks.length === 0) return {text, start, end};
    const checked = !tasks.every(task => task.checked);
    const chunks: string[] = [];
    let cursor = 0;
    for (const task of tasks) {
        // 已完成的 X 保留大小写；实际修改只有一个 UTF-16 字符，选区不需要偏移。
        if (task.checked === checked) continue;
        chunks.push(text.slice(cursor, task.state), checked ? "x" : " ");
        cursor = task.state + 1;
    }
    chunks.push(text.slice(cursor));
    return {text: chunks.join(""), start, end};
}
