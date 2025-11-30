import * as fs from 'fs';
import * as path from 'path';
import { SourceMapConsumer } from 'source-map';

export interface SourceLocation {
    source: string;
    line: number;
    column: number;
    name?: string | null;
}

export class SourceMapper {
    private consumers: Map<string, SourceMapConsumer> = new Map();
    private rootDir: string;

    constructor(rootDir: string) {
        this.rootDir = path.resolve(rootDir);
    }

    async init() {
        // Optional: Pre-load source maps if we want to scan everything
    }

    async map(runtimeFile: string, line: number, column: number): Promise<SourceLocation | null> {
        try {
            // 1. Find the source map file
            const mapFile = await this.findSourceMap(runtimeFile);
            if (!mapFile) {
                // console.warn(`No source map found for ${runtimeFile}`);
                return null;
            }

            // 2. Get or create consumer
            let consumer = this.consumers.get(mapFile);
            if (!consumer) {
                const rawMap = fs.readFileSync(mapFile, 'utf-8');
                const jsonMap = JSON.parse(rawMap);
                consumer = await new SourceMapConsumer(jsonMap);
                this.consumers.set(mapFile, consumer);
            }

            // 3. Query original position
            const original = consumer.originalPositionFor({ line, column });

            if (original.source && original.line !== null && original.column !== null) {
                // Resolve relative source path to absolute path
                // Source maps often use webpack:/// or relative paths
                let sourcePath = original.source;

                // Handle webpack protocols
                if (sourcePath.startsWith('webpack:///')) {
                    sourcePath = sourcePath.replace('webpack:///', '');
                } else if (sourcePath.startsWith('webpack://')) {
                    sourcePath = sourcePath.replace('webpack://', '');
                }

                // If relative, resolve against map file dir or root
                // Usually sources are relative to the sourceRoot or the map file
                // Let's try resolving against project root first if it looks like src/

                let absSourcePath = path.resolve(this.rootDir, sourcePath);
                if (!fs.existsSync(absSourcePath)) {
                    // Try relative to map file
                    absSourcePath = path.resolve(path.dirname(mapFile), sourcePath);
                }

                // If still not found, maybe it's in a src folder?
                if (!fs.existsSync(absSourcePath) && !sourcePath.startsWith('src/')) {
                    absSourcePath = path.resolve(this.rootDir, 'src', sourcePath);
                }

                return {
                    source: absSourcePath,
                    line: original.line,
                    column: original.column,
                    name: original.name
                };
            }
        } catch (e) {
            console.error(`Failed to map location for ${runtimeFile}:${line}:${column}`, e);
        }
        return null;
    }

    private async findSourceMap(runtimeFile: string): Promise<string | null> {
        // 1. Check if .map exists alongside
        const adjacentMap = runtimeFile + '.map';
        if (fs.existsSync(adjacentMap)) return adjacentMap;

        // 2. Check if file has sourceMappingURL comment
        try {
            if (fs.existsSync(runtimeFile)) {
                const content = fs.readFileSync(runtimeFile, 'utf-8');
                const match = content.match(/\/\/# sourceMappingURL=(.+)$/m);
                if (match) {
                    const mapUrl = match[1];
                    // If it's a data URL, we might need to handle it (skip for now)
                    if (mapUrl.startsWith('data:')) return null;

                    // Resolve relative to runtime file
                    const mapPath = path.resolve(path.dirname(runtimeFile), mapUrl);
                    if (fs.existsSync(mapPath)) return mapPath;
                }
            }
        } catch (e) {
            // ignore
        }

        return null;
    }

    destroy() {
        this.consumers.forEach(c => c.destroy());
        this.consumers.clear();
    }
}
