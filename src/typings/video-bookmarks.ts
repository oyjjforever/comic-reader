// 视频书签相关类型定义

export interface VideoBookmark {
    id?: number;
    video_path: string;
    time_point: number;
    title?: string;
    description?: string;
    created_at: string;
}