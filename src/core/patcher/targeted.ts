import { Fix } from '../../types';
import * as cheerio from 'cheerio';
import { createTwoFilesPatch } from 'diff';

interface Replacement {
    start: number;
    end: number;
    content: string;
}

export class TargetedPatcher {
    applyFixes(originalHtml: string, fixes: Fix[]): string {
        // @ts-ignore: Cheerio types don't fully support sourceCodeLocationInfo options yet
        const $ = cheerio.load(originalHtml, {
            sourceCodeLocationInfo: true,
            xmlMode: false
        });

        const replacements: Replacement[] = [];

        for (const fix of fixes) {
            try {
                const el = $(fix.selector).get(0);
                if (!el) {
                    console.warn(`Element not found for selector: ${fix.selector}`);
                    continue;
                }

                // @ts-ignore: Accessing internal sourceCodeLocation
                const location = el.sourceCodeLocation;
                if (!location || !location.startTag) {
                    console.warn(`No location info for element: ${fix.selector}`);
                    continue;
                }

                const startTag = location.startTag;
                const startOffset = startTag.startOffset;
                const endOffset = startTag.endOffset;

                // Original tag content (e.g. <div class="foo">)
                const originalTag = originalHtml.substring(startOffset, endOffset);

                if (fix.fixType === 'add-attribute') {
                    const attrName = fix.payload.attribute!;
                    const attrValue = fix.payload.value!;

                    // Check if attribute already exists to avoid duplication or conflict
                    // We can use location.attrs to check existence and location
                    const existingAttr = location.attrs && location.attrs[attrName.toLowerCase()];

                    if (existingAttr) {
                        // Replace existing attribute
                        replacements.push({
                            start: existingAttr.startOffset,
                            end: existingAttr.endOffset,
                            content: `${attrName}="${attrValue}"`
                        });
                    } else {
                        // Append new attribute before the closing >
                        // We need to find the last >. Be careful of > inside attribute values.
                        // Since we have the range of the start tag, the last character should be >.
                        // But let's be safe and use the endOffset - 1.

                        // Check for self-closing /
                        let insertPos = endOffset - 1;
                        if (originalHtml[insertPos] === '>') {
                            if (originalHtml[insertPos - 1] === '/') {
                                insertPos--; // Insert before />
                            }

                            replacements.push({
                                start: insertPos,
                                end: insertPos,
                                content: ` ${attrName}="${attrValue}"`
                            });
                        }
                    }
                } else if (fix.fixType === 'convert-tag') {
                    const newTagName = fix.payload.tagName!;

                    // Replace opening tag name
                    const tagContent = originalHtml.substring(startTag.startOffset + 1, startTag.endOffset);
                    const tagNameMatch = tagContent.match(/^([a-zA-Z0-9-]+)/);

                    if (tagNameMatch) {
                        const oldTagName = tagNameMatch[1];
                        const oldTagNameLen = oldTagName.length;

                        replacements.push({
                            start: startTag.startOffset + 1,
                            end: startTag.startOffset + 1 + oldTagNameLen,
                            content: newTagName
                        });
                    }

                    // Replace closing tag if exists
                    const endTag = location.endTag;
                    if (endTag) {
                        const endTagContent = originalHtml.substring(endTag.startOffset + 2, endTag.endOffset);
                        const endTagNameMatch = endTagContent.match(/^([a-zA-Z0-9-]+)/);

                        if (endTagNameMatch) {
                            const oldEndTagName = endTagNameMatch[1];
                            replacements.push({
                                start: endTag.startOffset + 2,
                                end: endTag.startOffset + 2 + oldEndTagName.length,
                                content: newTagName
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn(`Failed to calculate patch for: ${fix.selector}`, e);
            }
        }

        // Apply replacements in reverse order to preserve offsets
        replacements.sort((a, b) => b.start - a.start);

        let modifiedHtml = originalHtml;
        for (const replacement of replacements) {
            modifiedHtml =
                modifiedHtml.substring(0, replacement.start) +
                replacement.content +
                modifiedHtml.substring(replacement.end);
        }

        return modifiedHtml;
    }

    generatePatch(originalHtml: string, fixes: Fix[], filename: string = 'index.html'): string {
        const modifiedHtml = this.applyFixes(originalHtml, fixes);

        // Generate unified diff
        const patch = createTwoFilesPatch(
            filename,
            filename,
            originalHtml,
            modifiedHtml,
            'Original',
            'Fixed'
        );

        return patch;
    }
}
