import {scanSource, type TaskMarker} from "./sourceScan";
export type {TaskMarker} from "./sourceScan";

/** 任务与代码编辑必须使用相同的围栏边界。 */
export const taskMarkers = (text: string): TaskMarker[] => scanSource(text).tasks;
