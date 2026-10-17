export type Platform='TikTok'|'Instagram'|'Facebook'|'LinkedIn';
export type Match='Exact Match'|'Similar Image'|'Partial Match';
export interface Result{id:string;platform:Platform;user:string;caption:string;date:string;match:Match;conf:number;img:string;url:string|null}
export interface Search{id:string;type:'photo'|'name';q:string;thumb?:string;platforms:Platform[]}
export interface HistoryEntry{id:string;type:'photo'|'name';q:string;at:string;count:number;platforms:Platform[]}
