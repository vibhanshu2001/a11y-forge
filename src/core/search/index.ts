import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { Signature } from '../../types';
import { Scorer, CandidateNode } from './scorer';
import { walkReact } from './walkers/react';
import { walkVue } from './walkers/vue';
import { walkHtml } from './walkers/html';

export interface SearchResult {
    file: string;
    line: number;
    column: number;
    score: number;
    node: CandidateNode;
}

export class SourceSearcher {
    private scorer = new Scorer();

    async find(signature: Signature, srcDir: string): Promise<SearchResult | null> {
        // Find all relevant files
        const files = await glob('**/*.{tsx,jsx,vue,html}', { cwd: srcDir, absolute: true, ignore: ['**/node_modules/**', '**/dist/**'] });

        let bestMatch: SearchResult | null = null;

        for (const file of files) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                let candidates: CandidateNode[] = [];

                if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
                    candidates = walkReact(content, file);
                } else if (file.endsWith('.vue')) {
                    candidates = walkVue(content, file);
                } else if (file.endsWith('.html')) {
                    candidates = walkHtml(content, file);
                }
                // Add Vue/HTML later

                for (const candidate of candidates) {
                    const score = this.scorer.score(signature, candidate);
                    if (score > 0) {
                        if (!bestMatch || score > bestMatch.score) {
                            bestMatch = {
                                file,
                                line: candidate.location.line,
                                column: candidate.location.column,
                                score,
                                node: candidate
                            };
                        }
                    }
                }
            } catch (e) {
                console.error(`Failed to parse file ${file}: `, e);
            }
        }

        return bestMatch;
    }
}
