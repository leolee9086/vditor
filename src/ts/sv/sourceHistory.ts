/** 源模式把选区与文本分开保存，正文里的字面 <wbr> 不承担光标标记。 */
export interface SourceSnapshot {
    text: string;
    start: number;
    end: number;
    direction: "forward" | "backward" | "none";
}

/** 编辑器会话内的撤销栈；文件的持久化版本历史由调用方负责。 */
export class SourceHistory {
    private states: SourceSnapshot[] = [];
    private index = -1;

    constructor(private readonly limit = 50) {}

    public get canUndo() { return this.index > 0; }
    public get canRedo() { return this.index >= 0 && this.index < this.states.length - 1; }

    public reset(state: SourceSnapshot) {
        this.states = [{...state}];
        this.index = 0;
    }

    /** 同一文本的光标移动只更新选区，保留重做分支。 */
    public rememberSelection(state: SourceSnapshot) {
        if (this.states[this.index]?.text === state.text) this.states[this.index] = {...state};
    }

    public record(state: SourceSnapshot) {
        if (this.states[this.index]?.text === state.text) {
            this.rememberSelection(state);
            return;
        }
        this.states.splice(this.index + 1);
        this.states.push({...state});
        if (this.states.length > this.limit) this.states.shift();
        this.index = this.states.length - 1;
    }

    public undo(): SourceSnapshot | undefined {
        return this.canUndo ? {...this.states[--this.index]} : undefined;
    }

    public redo(): SourceSnapshot | undefined {
        return this.canRedo ? {...this.states[++this.index]} : undefined;
    }
}

export const sourceSnapshot = (element: HTMLTextAreaElement): SourceSnapshot => ({
    text: element.value,
    start: element.selectionStart,
    end: element.selectionEnd,
    direction: element.selectionDirection,
});
