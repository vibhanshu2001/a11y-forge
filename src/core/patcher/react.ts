import { Fix } from '../../types';
import jscodeshift, { API, FileInfo } from 'jscodeshift';
import * as fs from 'fs';

export class ReactPatcher {
    private j = jscodeshift.withParser('tsx');

    applyFixes(sourceFile: string, fixes: Fix[]): string {
        if (!fs.existsSync(sourceFile)) {
            console.error(`Source file not found: ${sourceFile}`);
            return '';
        }

        const source = fs.readFileSync(sourceFile, 'utf-8');
        const root = this.j(source);
        let modified = false;

        for (const fix of fixes) {
            // In a real scenario, we would use the line/column from source map to find the EXACT node.
            // For now, we will try to find the element by matching attributes or structure if possible,
            // OR rely on the fact that we might have line numbers from the mapper.

            // Assuming fix.metadata contains sourceLocation: { line, column }
            const loc = fix.metadata?.sourceLocation;
            if (loc && loc.line) {
                // Find node at line/column
                root.findJSXElements().forEach(path => {
                    const node = path.node;
                    if (node.loc && node.loc.start.line === loc.line) {
                        // Found the element!
                        this.applyFixToNode(path, fix);
                        modified = true;
                    }
                });
            } else {
                // Fallback: Try to match by selector? 
                // Selectors are CSS selectors on the DOM, hard to map to AST without line numbers.
                // We will skip if no location info for now.
                console.warn(`Skipping fix for ${sourceFile} - no source location info.`);
            }
        }

        return modified ? root.toSource() : source;
    }

    private applyFixToNode(path: any, fix: Fix) {
        const j = this.j;
        const node = path.node;

        if (fix.fixType === 'add-attribute') {
            const attrName = fix.payload.attribute!;
            const attrValue = fix.payload.value!;

            // Check if attribute exists
            const existingAttr = node.openingElement.attributes.find(
                (attr: any) => attr.name && attr.name.name === attrName
            );

            if (existingAttr) {
                // Update value
                existingAttr.value = j.stringLiteral(attrValue);
            } else {
                // Add new attribute
                node.openingElement.attributes.push(
                    j.jsxAttribute(
                        j.jsxIdentifier(attrName),
                        j.stringLiteral(attrValue)
                    )
                );
            }
        } else if (fix.fixType === 'convert-tag') {
            const newTagName = fix.payload.tagName!;

            // Update opening tag
            if (node.openingElement.name.type === 'JSXIdentifier') {
                node.openingElement.name.name = newTagName;
            }

            // Update closing tag if it exists
            if (node.closingElement && node.closingElement.name.type === 'JSXIdentifier') {
                node.closingElement.name.name = newTagName;
            }

            // Handle attributes if provided
            if (fix.payload.attributes) {
                Object.entries(fix.payload.attributes).forEach(([key, value]) => {
                    const existingAttr = node.openingElement.attributes.find(
                        (attr: any) => attr.name && attr.name.name === key
                    );
                    if (existingAttr) {
                        existingAttr.value = j.stringLiteral(value);
                    } else {
                        node.openingElement.attributes.push(
                            j.jsxAttribute(
                                j.jsxIdentifier(key),
                                j.stringLiteral(value)
                            )
                        );
                    }
                });
            }
        }
    }
}
