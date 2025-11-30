declare module 'wcag-contrast' {
    export function hex(a: string, b: string): number;
    export function rgb(a: number[], b: number[]): number;
    export function score(contrast: number): string;
}
