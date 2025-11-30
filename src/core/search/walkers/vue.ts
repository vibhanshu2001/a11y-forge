import * as cheerio from 'cheerio';
import { CandidateNode } from '../scorer';
import * as compiler from 'vue-template-compiler';

export function walkVue(source: string, filePath: string): CandidateNode[] {
    const parsed = compiler.parseComponent(source);
    const template = parsed.template;
    if (!template || !template.content) return [];

    // Calculate offset of template start
    const templateOffset = template.start;

    // Use Cheerio to parse template content
    // We use xmlMode: false (HTML) but with lowerCaseTags: false if we want to preserve component case?
    // Vue components are often PascalCase. HTML tags are lowercase.
    // Cheerio defaults to lowercase tags in HTML mode.
    // Let's use xmlMode: true to preserve case, but it might be strict on void tags.
    // Actually, Vue templates are valid HTML usually.
    const $ = cheerio.load(template.content, {
        sourceCodeLocationInfo: true,
        xmlMode: false
    } as any);

    const candidates: CandidateNode[] = [];

    $('*').each((i, el: any) => {
        // Skip root/head/body if created by cheerio
        if (el.tagName === 'html' || el.tagName === 'head' || el.tagName === 'body') return;

        const node = $(el);
        const tag = el.tagName;

        // Text: Get direct text or aggregated?
        // node.text() gets aggregated.
        // Let's use that for fuzzy match.
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

        // Location
        let line = 0;
        let column = 0;
        let closingLocation: { line: number, column: number } | undefined;

        if (el.sourceCodeLocation) {
            line = el.sourceCodeLocation.startLine;
            column = el.sourceCodeLocation.startCol;

            // Adjust for template position in file
            // We need to count newlines before template.start in source
            const preTemplate = source.substring(0, templateOffset);
            const preLines = preTemplate.split('\n').length - 1;
            line += preLines;

            if (el.sourceCodeLocation.endTag) {
                closingLocation = {
                    line: el.sourceCodeLocation.endTag.startLine + preLines,
                    column: el.sourceCodeLocation.endTag.startCol
                };
            }
        }

        candidates.push({
            tag,
            text,
            classes,
            attributes,
            originalNode: el,
            location: { line, column },
            closingLocation,
            file: filePath
        });
    });

    return candidates;
}
