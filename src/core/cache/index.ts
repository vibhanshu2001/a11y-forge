import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class AICache {
    private cachePath: string;
    private cache: Record<string, any>;

    constructor(cacheDir: string = process.cwd()) {
        this.cachePath = path.join(cacheDir, '.a11y-cache.json');
        this.cache = this.loadCache();
    }

    private loadCache(): Record<string, any> {
        if (fs.existsSync(this.cachePath)) {
            try {
                return JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
            } catch (e) {
                console.warn('Failed to load cache, starting fresh.', e);
                return {};
            }
        }
        return {};
    }

    saveCache() {
        try {
            fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
        } catch (e) {
            console.error('Failed to save cache:', e);
        }
    }

    get(key: string): any | undefined {
        return this.cache[key];
    }

    set(key: string, value: any) {
        this.cache[key] = value;
        // Auto-save on set to prevent data loss on crash, 
        // but for batching we might want to save explicitly later.
        // For now, simple is better.
        this.saveCache();
    }

    generateKey(signature: any): string {
        // Create a stable key from signature
        // We only care about tag, classes, attributes (relevant ones), text
        const stableSig = {
            tag: signature.tag,
            classes: (signature.classes || []).sort(),
            text: (signature.text || '').trim(),
            // We might want to include specific attributes like src for images
            src: signature.attributes?.src,
            id: signature.attributes?.id
        };
        const str = JSON.stringify(stableSig);
        return crypto.createHash('md5').update(str).digest('hex');
    }
}
