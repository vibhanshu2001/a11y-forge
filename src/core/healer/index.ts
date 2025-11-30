import { AIGenerator, MockAIGenerator } from '../fixer';

export class AutoHealer {
    private ai: AIGenerator;

    constructor(ai?: AIGenerator) {
        this.ai = ai || new MockAIGenerator();
    }

    async heal(content: string, errors: string[], filePath: string): Promise<string> {
        console.log(`Attempting to heal ${filePath} with ${errors.length} errors...`);

        // We can pass file path context if needed
        const healedContent = await this.ai.healCode(content, errors);

        return healedContent;
    }
}
