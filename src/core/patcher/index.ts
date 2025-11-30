import { Fix } from '../../types';
export * from './index';
export * from './targeted';

export class Patcher {
    generatePatch(originalHtml: string, fixes: Fix[], filename: string = 'index.html'): string {
        // Forward to TargetedPatcher
        const { TargetedPatcher } = require('./targeted');
        return new TargetedPatcher().generatePatch(originalHtml, fixes, filename);
    }

    applyFixes(originalHtml: string, fixes: Fix[]): string {
        // Forward to TargetedPatcher
        const { TargetedPatcher } = require('./targeted');
        return new TargetedPatcher().applyFixes(originalHtml, fixes);
    }
}
