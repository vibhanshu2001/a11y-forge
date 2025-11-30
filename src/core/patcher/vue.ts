import { Fix } from '../../types';
import * as fs from 'fs';
// @ts-ignore
import * as compiler from 'vue-template-compiler';

export class VuePatcher {
    applyFixes(sourceFile: string, fixes: Fix[]): string {
        if (!fs.existsSync(sourceFile)) {
            console.error(`Source file not found: ${sourceFile}`);
            return '';
        }

        let source = fs.readFileSync(sourceFile, 'utf-8');
        const descriptor = compiler.parseComponent(source);

        if (!descriptor.template) {
            console.warn(`No template found in ${sourceFile}`);
            return source;
        }

        // We need to patch the template content.
        // Vue template compiler gives us AST but doesn't easily support writing back.
        // We will use a regex-based approach for now, or a simple string replacement based on line numbers if we have them.
        // Since we have line numbers from SourceMapper, we can target specific lines.

        // Sort fixes by line number (descending) to avoid offset issues if we modify lines
        fixes.sort((a, b) => {
            const lineA = a.metadata?.sourceLocation?.line || 0;
            const lineB = b.metadata?.sourceLocation?.line || 0;
            return lineB - lineA;
        });

        const lines = source.split('\n');

        for (const fix of fixes) {
            const loc = fix.metadata?.sourceLocation;
            if (loc && loc.line) {
                const lineIndex = loc.line - 1;
                if (lineIndex >= 0 && lineIndex < lines.length) {
                    let lineContent = lines[lineIndex];

                    // Simple attribute injection
                    if (fix.fixType === 'add-attribute') {
                        const attrName = fix.payload.attribute!;
                        const attrValue = fix.payload.value!;

                        // Check if attribute exists in this line
                        // This is a naive check, assumes tag is on one line or we hit the start line
                        if (!lineContent.includes(attrName + '=')) {
                            // Insert before the last > or />
                            // We need to be careful not to break the tag.
                            // Ideally we find the tag end.
                            // For MVP, let's just append to the end of the opening tag if it's on this line.

                            const tagEnd = lineContent.lastIndexOf('>');
                            const selfClosing = lineContent.lastIndexOf('/>');

                            let insertPos = -1;
                            if (selfClosing !== -1 && selfClosing > lineContent.lastIndexOf('<')) {
                                insertPos = selfClosing;
                            } else if (tagEnd !== -1 && tagEnd > lineContent.lastIndexOf('<')) {
                                insertPos = tagEnd;
                            }

                            if (insertPos !== -1) {
                                lineContent = lineContent.slice(0, insertPos) + ` ${attrName}="${attrValue}"` + lineContent.slice(insertPos);
                                lines[lineIndex] = lineContent;
                            }
                        }
                    } else if (fix.fixType === 'convert-tag') {
                        const newTagName = fix.payload.tagName!;

                        // Replace opening tag
                        // Assuming tag starts at the first < on the line or we can use regex
                        // Naive: replace first occurrence of <OldTag with <NewTag
                        // Better: Use column info if available? We don't have column info in fix.metadata.sourceLocation for the *tag start* exactly, 
                        // but we have it for the node start.
                        // Let's assume the node starts at `loc.column`.

                        // Actually, loc.column is where the node starts.
                        // So lineContent[loc.column] should be '<'.
                        // Let's verify.

                        // Replace opening tag
                        // const oldTagRegex = new RegExp(`^<([a-zA-Z0-9-]+)`); // This regex is not used
                        // We need to find the tag at the specific column
                        // But lines array is 0-indexed, loc.column is 0-indexed (from Cheerio/VueWalker).

                        // However, we are iterating lines.
                        // If we have column info, let's use it.
                        const col = loc.column;
                        if (col !== undefined && lineContent[col] === '<') {
                            // Find the end of the tag name
                            let endOfTagName = col + 1;
                            while (endOfTagName < lineContent.length && /[a-zA-Z0-9-]/.test(lineContent[endOfTagName])) {
                                endOfTagName++;
                            }
                            // Replace
                            lineContent = lineContent.substring(0, col + 1) + newTagName + lineContent.substring(endOfTagName);
                            lines[lineIndex] = lineContent;
                        }

                        // Replace closing tag if exists
                        const closingLoc = (fix.metadata?.sourceLocation as any)?.closingLocation;
                        if (closingLoc) {
                            const closingLineIndex = closingLoc.line - 1;
                            if (closingLineIndex >= 0 && closingLineIndex < lines.length) {
                                let closingLineContent = lines[closingLineIndex];
                                const closingCol = closingLoc.column;

                                // closingCol points to start of </Tag>
                                if (closingCol !== undefined && closingLineContent.substring(closingCol, closingCol + 2) === '</') {
                                    let endOfTagName = closingCol + 2;
                                    while (endOfTagName < closingLineContent.length && /[a-zA-Z0-9-]/.test(closingLineContent[endOfTagName])) {
                                        endOfTagName++;
                                    }
                                    closingLineContent = closingLineContent.substring(0, closingCol + 2) + newTagName + closingLineContent.substring(endOfTagName);
                                    lines[closingLineIndex] = closingLineContent;
                                }
                            }
                        }
                    }
                }
            }
        }

        return lines.join('\n');
    }
}
