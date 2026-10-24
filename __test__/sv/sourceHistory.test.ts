import {SourceHistory} from "../../src/ts/sv/sourceHistory";

const state = (text: string, start = text.length, end = start) => ({
    text,
    start,
    end,
    direction: "none" as const,
});

describe("source-mode history", () => {
    it("undoes and redoes text changes while restoring the selection", () => {
        const history = new SourceHistory();
        history.reset(state("原文", 1));
        history.record(state("原文修改", 4));
        expect(history.undo()).toEqual(state("原文", 1));
        expect(history.redo()).toEqual(state("原文修改", 4));
    });

    it("drops a redo branch after a new edit", () => {
        const history = new SourceHistory();
        history.reset(state("a"));
        history.record(state("ab"));
        expect(history.undo()).toEqual(state("a"));
        history.record(state("ac"));
        expect(history.canRedo).toBe(false);
        expect(history.undo()).toEqual(state("a"));
    });

    it("keeps literal markup and backward selections out of history markers", () => {
        const history = new SourceHistory();
        const original = {...state("😀<wbr>\u00a0\n\n", 2, 7), direction: "backward" as const};
        history.reset(original);
        history.record(state("changed"));
        expect(history.undo()).toEqual(original);
        history.record({...original, start: 3});
        expect(history.canRedo).toBe(true);
        expect(history.redo()).toEqual(state("changed"));
    });

    it("bounds session snapshots without mutating snapshots returned to callers", () => {
        const history = new SourceHistory(3);
        history.reset(state("a"));
        history.record(state("b"));
        history.record(state("c"));
        history.record(state("d"));
        const previous = history.undo()!;
        previous.text = "must not leak";
        expect(history.undo()).toEqual(state("b"));
        expect(history.undo()).toBeUndefined();
        expect(history.redo()).toEqual(state("c"));
    });

    it("updates a selection without creating an empty edit step", () => {
        const history = new SourceHistory();
        history.reset(state("abc", 1));
        history.rememberSelection(state("abc", 2));
        expect(history.canUndo).toBe(false);
        expect(history.undo()).toBeUndefined();
        expect(history.redo()).toBeUndefined();
    });
});
