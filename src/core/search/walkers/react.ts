import jscodeshift from 'jscodeshift';
import { CandidateNode } from '../scorer';

export function walkReact(source: string, filePath: string): CandidateNode[] {
    const j = jscodeshift.withParser('tsx');
    const root = j(source);
    const candidates: CandidateNode[] = [];

    root.findJSXElements().forEach(path => {
        const node = path.node;
        const opening = node.openingElement;

        let tagName = 'unknown';
        if (opening.name.type === 'JSXIdentifier') {
            tagName = opening.name.name;
        } else if (opening.name.type === 'JSXMemberExpression') {
            // Handle Component.SubComponent
            tagName = 'Component'; // Simplified
        }

        const attributes: Record<string, string> = {};
        let classes: string[] = [];

        opening.attributes?.forEach((attr: any) => {
            if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier') {
                const name = attr.name.name;
                let value = '';
                if (attr.value?.type === 'StringLiteral') {
                    value = attr.value.value;
                } else if (attr.value?.type === 'JSXExpressionContainer') {
                    // Handle simple expressions or skip
                    // For now, skip complex expressions
                }

                attributes[name] = value;

                if (name === 'className' || name === 'class') {
                    classes = value.split(/\s+/).filter(Boolean);
                }
            }
        });

        // Extract text
        // This is tricky in JSX as text can be split across children
        let text = '';
        node.children?.forEach((child: any) => {
            if (child.type === 'JSXText') {
                text += child.value.trim() + ' ';
            } else if (child.type === 'JSXExpressionContainer') {
                // Try to extract string from expression if possible
                if (child.expression.type === 'StringLiteral') {
                    text += child.expression.value + ' ';
                }
            }
        });
        text = text.trim();

        candidates.push({
            tag: tagName,
            text,
            classes,
            attributes,
            originalNode: node,
            location: node.loc ? { line: node.loc.start.line, column: node.loc.start.column } : { line: 0, column: 0 },
            file: filePath
        });
    });

    return candidates;
}
