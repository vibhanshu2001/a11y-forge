import { Signature } from '../../types';

export interface CandidateNode {
    tag: string;
    text?: string;
    classes?: string[];
    attributes?: Record<string, string>;
    structure?: string[]; // Ancestors
    originalNode: any; // The AST node
    location: { line: number, column: number };
    closingLocation?: { line: number, column: number }; // For closing tag
    file: string;
}

export class Scorer {
    score(signature: Signature, candidate: CandidateNode): number {
        let score = 0;

        // 1. Tag Match (Essential)
        // If tags don't match, it's likely not the element, unless it's a component wrapper.
        if (signature.tag.toLowerCase() === candidate.tag.toLowerCase()) {
            score += 10;
        } else {
            // Penalty? Or just 0.
            // If candidate is a component (Capitalized), it might wrap the element.
            // But we are looking for the *exact* element to patch.
            // If we patch a component <Button>, we might be patching the prop.
            // Let's assume strict tag match for now, or allow known mappings.
            return 0; // Hard filter for now
        }

        // 2. Text Match (High Weight)
        if (signature.text && candidate.text) {
            const sigText = signature.text.trim().toLowerCase();
            const candText = candidate.text.trim().toLowerCase();
            if (sigText === candText) {
                score += 50;
            } else if (candText.includes(sigText) || sigText.includes(candText)) {
                score += 20;
            }
        }

        // 3. ID Match (Very High Weight)
        if (signature.attributes?.id && candidate.attributes?.id) {
            if (signature.attributes.id === candidate.attributes.id) {
                score += 100;
            }
        }

        // 4. Class Match (Medium Weight)
        if (signature.classes && candidate.classes) {
            const intersection = signature.classes.filter(c => candidate.classes!.includes(c));
            score += intersection.length * 5;
        }

        // 5. Attribute Match (Medium Weight)
        if (signature.attributes && candidate.attributes) {
            for (const [key, val] of Object.entries(signature.attributes)) {
                if (key === 'class' || key === 'id') continue; // Handled above
                if (candidate.attributes[key] === val) {
                    score += 10;
                }
            }
        }

        // 6. Structure Match (Bonus)
        // TODO: Implement structure matching if candidate has ancestor info

        return score;
    }
}
