import * as cheerio from 'cheerio';
import { CandidateNode } from '../scorer';

export function walkHtml(source: string, filePath: string): CandidateNode[] {
    const $ = cheerio.load(source, {
        sourceCodeLocationInfo: true,
        xmlMode: false
    } as any);

    const candidates: CandidateNode[] = [];

    $('*').each((i, el: any) => {
        // Skip root/head/body if created by cheerio and not in source?
        // Cheerio adds html/head/body if missing.
        // We can check if sourceCodeLocation is present.
        if (!el.sourceCodeLocation) return;

        const node = $(el);
        const tag = el.tagName;
        const text = node.text().trim();

        const attributes: Record<string, string> = {};
        let classes: string[] = [];

        if (el.attribs) {
            for (const [key, val] of Object.entries(el.attribs)) {
                attributes[key] = String(val);
                if (key === 'class') {
                    classes = String(val).split(/\s+/).filter(Boolean);
                }
            }
        }

        const line = el.sourceCodeLocation.startLine;
        const column = el.sourceCodeLocation.startCol;

        candidates.push({
            tag,
            text,
            classes,
            attributes,
            originalNode: el,
            location: { line, column },
            file: filePath
        });
    });

    return candidates;
}
