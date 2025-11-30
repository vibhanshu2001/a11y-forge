import { Issue, Fix } from '../../types';
import OpenAI from 'openai';

export interface BatchItem {
    id: string;
    selector: string;
    context: any;
    signature?: any;
}

export interface BatchResult {
    id: string;
    result: string;
    isValid?: boolean;
    reasoning?: string;
}

export interface AIGenerator {
    generateAltText(context: string, extraContext?: any): Promise<string>;
    generateLabel(context: string, extraContext?: any): Promise<string>;
    healCode(code: string, errors: string[]): Promise<string>;
    validateSemanticChange(selector: string, proposedTag: string, context: any): Promise<{ isValid: boolean, reasoning: string }>;

    // Batch Methods
    generateAltTextBatch(items: BatchItem[]): Promise<BatchResult[]>;
    generateLabelBatch(items: BatchItem[]): Promise<BatchResult[]>;
    validateSemanticChangeBatch(items: BatchItem[]): Promise<BatchResult[]>;
    validateInteractiveRoleBatch(items: BatchItem[]): Promise<BatchResult[]>;
}

export class MockAIGenerator implements AIGenerator {
    async generateAltText(context: string, extraContext?: any): Promise<string> {
        let text = "Generated alt text";
        if (extraContext?.parentComponent) text += ` for ${extraContext.parentComponent}`;
        if (extraContext?.landmark) text += ` in ${extraContext.landmark}`;
        return text;
    }

    async generateLabel(context: string, extraContext?: any): Promise<string> {
        return "Generated Label";
    }

    async healCode(code: string, errors: string[]): Promise<string> {
        return code + "\n// Healed by Mock AI";
    }

    async validateSemanticChange(selector: string, proposedTag: string, context: any): Promise<{ isValid: boolean, reasoning: string }> {
        return { isValid: true, reasoning: "Mock AI validation: Change seems appropriate." };
    }

    async generateAltTextBatch(items: BatchItem[]): Promise<BatchResult[]> {
        return items.map(item => ({ id: item.id, result: "Generated alt text (Batch)" }));
    }

    async generateLabelBatch(items: BatchItem[]): Promise<BatchResult[]> {
        return items.map(item => ({ id: item.id, result: "Generated Label (Batch)" }));
    }

    async validateSemanticChangeBatch(items: BatchItem[]): Promise<BatchResult[]> {
        return items.map(item => ({ id: item.id, result: "VALID", isValid: true, reasoning: "Mock Batch Validation" }));
    }

    async validateInteractiveRoleBatch(items: BatchItem[]): Promise<BatchResult[]> {
        return items.map(item => ({ id: item.id, result: "VALID", isValid: true, reasoning: "Mock Interactive Validation" }));
    }
}

class PromptBuilder {
    static buildAltTextPrompt(selector: string, context?: any): string {
        let prompt = `Generate a concise, descriptive alt text (5-15 words) for an image.
Context:
- Selector: ${selector}`;

        if (context) {
            if (context.landmark) prompt += `\n- Location: Inside <${context.landmark}>`;
            if (context.parentComponent) prompt += `\n- Component: ${context.parentComponent}`;
            if (context.surroundingText) prompt += `\n- Surrounding Text: "${context.surroundingText}"`;
            if (context.attributes) prompt += `\n- Attributes: ${JSON.stringify(context.attributes)}`;
        }

        prompt += `\n\nRules:
1. Describe the function or meaning, not just appearance.
2. Do NOT start with "Image of" or "Picture of".
3. If it seems decorative (e.g. icon with no function), return "decorative".
4. Return ONLY the alt text.`;
        return prompt;
    }

    static buildLabelPrompt(selector: string, context?: any): string {
        let prompt = `Generate a concise, descriptive label for an input field.
Context:
- Selector: ${selector}`;

        if (context) {
            if (context.landmark) prompt += `\n- Location: Inside <${context.landmark}>`;
            if (context.parentComponent) prompt += `\n- Component: ${context.parentComponent}`;
            if (context.surroundingText) prompt += `\n- Surrounding Text: "${context.surroundingText}"`;
            if (context.attributes) prompt += `\n- Attributes: ${JSON.stringify(context.attributes)}`;
        }

        prompt += `\n\nReturn ONLY the label text.`;
        return prompt;
    }

    static buildHealPrompt(code: string, errors: string[]): string {
        return `Fix the following code which has syntax errors.
Errors:
${errors.join('\n')}

Code:
\`\`\`
${code}
\`\`\`

Return ONLY the fixed code block. Do not include markdown formatting like \`\`\`.`;
    }

    static buildValidationPrompt(selector: string, proposedTag: string, context: any): string {
        let prompt = `I am planning to change an HTML element to <${proposedTag}> to improve accessibility (semantic landmarks).
Please validate if this change is appropriate based on the context.

Element: ${selector}
Proposed Tag: <${proposedTag}>`;

        if (context) {
            if (context.attributes) prompt += `\nAttributes: ${JSON.stringify(context.attributes)}`;
            if (context.surroundingText) prompt += `\nSurrounding Text: "${context.surroundingText}"`;
            if (context.parentComponent) prompt += `\nParent Component: ${context.parentComponent}`;
        }

        prompt += `\n\nAnalyze the class names, IDs, and context.
If the change is correct (e.g. id="main-nav" -> <nav>), return "VALID: <reasoning>".
If the change is incorrect or risky (e.g. generic div used for layout), return "INVALID: <reasoning>".
Keep reasoning concise (1 sentence).`;
        return prompt;
    }

    static buildAltTextBatchPrompt(items: BatchItem[]): string {
        const itemsJson = items.map(item => ({
            id: item.id,
            selector: item.selector,
            context: item.context?.surroundingText || '',
            component: item.context?.parentComponent || '',
            attributes: item.context?.attributes || {},
            landmark: item.context?.landmark || ''
        }));

        return `You are generating accurate, short alt-text for images.
Rules:
- Max 10-15 words
- Describe meaning, not pixels
- Use context: file name, component name, neighbor text
- Never say "image of" or "picture of"
- If decorative -> return alt=""

Input:
${JSON.stringify(itemsJson, null, 2)}

Output (JSON only):
[
  { "id": "...", "alt": "..." },
  ...
]`;
    }

    static buildLabelBatchPrompt(items: BatchItem[]): string {
        const itemsJson = items.map(item => ({
            id: item.id,
            selector: item.selector,
            context: item.context?.surroundingText || '',
            component: item.context?.parentComponent || '',
            attributes: item.context?.attributes || {},
            landmark: item.context?.landmark || ''
        }));

        return `Generate concise, descriptive labels for input fields.
Rules:
- Max 5-10 words
- Return ONLY the label text

Input:
${JSON.stringify(itemsJson, null, 2)}

Output (JSON only):
[
  { "id": "...", "label": "..." },
  ...
]`;
    }

    static buildValidationBatchPrompt(items: BatchItem[]): string {
        const itemsJson = items.map(item => ({
            id: item.id,
            selector: item.selector,
            proposedTag: item.context?.landmark || 'div', // Assuming landmark is the target
            attributes: item.context?.attributes || {},
            context: item.context?.surroundingText || ''
        }));

        return `Validate if the following HTML semantic changes are appropriate.
Analyze the class names, IDs, and context.
If the change is correct (e.g. id="main-nav" -> <nav>), return isValid: true.
If the change is incorrect or risky (e.g. generic div used for layout), return isValid: false.

Input:
${JSON.stringify(itemsJson, null, 2)}

Output (JSON only):
[
  { "id": "...", "isValid": true/false, "reasoning": "..." },
  ...
]`;
    }

    static buildInteractiveValidationBatchPrompt(items: BatchItem[]): string {
        const itemsJson = items.map(item => ({
            id: item.id,
            selector: item.selector,
            tag: item.signature?.tag || 'div',
            classes: item.signature?.classes || [],
            attributes: item.context?.attributes || {},
            context: item.context?.surroundingText || ''
        }));

        return `Analyze if the following elements are truly interactive and require role="button" or tabindex="0".
Sometimes text elements have click handlers for selection but aren't buttons.
If it looks like a button/link/interactive control, return isValid: true.
If it looks like static text, a label, or a container that shouldn't be a button, return isValid: false.

Input:
${JSON.stringify(itemsJson, null, 2)}

Output (JSON only):
[
  { "id": "...", "isValid": true/false, "reasoning": "..." },
  ...
]`;
    }
}

export class OpenAIGenerator implements AIGenerator {
    private client: OpenAI;

    constructor(apiKey: string) {
        this.client = new OpenAI({ apiKey });
    }

    async generateAltText(selector: string, context?: any): Promise<string> {
        try {
            const prompt = PromptBuilder.buildAltTextPrompt(selector, context);
            const response = await this.client.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "You are an accessibility expert." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 60,
            });
            const result = response.choices[0].message.content?.trim() || "";
            return result.toLowerCase() === 'decorative' ? '' : result;
        } catch (error) {
            console.error("OpenAI Error:", error);
            return "Generated alt text (AI Error)";
        }
    }

    async generateLabel(selector: string, context?: any): Promise<string> {
        try {
            const prompt = PromptBuilder.buildLabelPrompt(selector, context);
            const response = await this.client.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "You are an accessibility expert." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 30,
            });
            return response.choices[0].message.content?.trim() || "Generated Label";
        } catch (error) {
            console.error("OpenAI Error:", error);
            return "Generated Label (AI Error)";
        }
    }

    async healCode(code: string, errors: string[]): Promise<string> {
        try {
            const prompt = PromptBuilder.buildHealPrompt(code, errors);
            const response = await this.client.chat.completions.create({
                model: "gpt-4-turbo", // Use GPT-4 Turbo for larger context (128k)
                messages: [
                    { role: "system", content: "You are an expert code fixer. Fix the syntax errors in the provided code. Return only the code." },
                    { role: "user", content: prompt }
                ],
                temperature: 0
            });
            let fixedCode = response.choices[0].message.content?.trim() || code;
            // Strip markdown code blocks if present
            fixedCode = fixedCode.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
            return fixedCode;
        } catch (error) {
            console.error("OpenAI Error:", error);
            return code;
        }
    }

    async validateSemanticChange(selector: string, proposedTag: string, context: any): Promise<{ isValid: boolean, reasoning: string }> {
        try {
            const prompt = PromptBuilder.buildValidationPrompt(selector, proposedTag, context);
            const response = await this.client.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "You are an accessibility expert validating code changes." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 60,
            });
            const result = response.choices[0].message.content?.trim() || "";

            if (result.startsWith("VALID:")) {
                return { isValid: true, reasoning: result.substring(6).trim() };
            } else if (result.startsWith("INVALID:")) {
                return { isValid: false, reasoning: result.substring(8).trim() };
            } else {
                // Fallback if format is weird
                return { isValid: true, reasoning: "AI validation inconclusive, proceeding with caution." };
            }
        } catch (error) {
            console.error("OpenAI Error:", error);
            return { isValid: true, reasoning: "AI validation failed (API Error)." };
        }
    }

    async generateAltTextBatch(items: BatchItem[]): Promise<BatchResult[]> {
        if (items.length === 0) return [];
        try {
            const prompt = PromptBuilder.buildAltTextBatchPrompt(items);
            const response = await this.client.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are an accessibility expert. Return valid JSON only." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            });
            const content = response.choices[0].message.content || '[]';
            // Handle potential wrapping in a key like { "results": [...] } or just [...]
            // But prompt asks for array. JSON mode usually enforces object if schema not provided?
            // Actually json_object mode requires output to be an object, not array at root.
            // So I should update prompt to ask for { "results": [...] }
            // Let's adjust parsing to be safe.
            let results: any[] = [];
            try {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) results = parsed;
                else if (parsed.results && Array.isArray(parsed.results)) results = parsed.results;
                else if (parsed.items && Array.isArray(parsed.items)) results = parsed.items;
                // Fallback: try to find array in values
                else results = Object.values(parsed).find(v => Array.isArray(v)) as any[] || [];
            } catch (e) {
                // Try to extract JSON from markdown block if present
                const match = content.match(/```json\n([\s\S]*?)\n```/);
                if (match) {
                    const parsed = JSON.parse(match[1]);
                    if (Array.isArray(parsed)) results = parsed;
                }
            }

            return results.map((r: any) => ({
                id: r.id,
                result: r.alt || ''
            }));
        } catch (error) {
            console.error("OpenAI Batch Error:", error);
            return [];
        }
    }

    async generateLabelBatch(items: BatchItem[]): Promise<BatchResult[]> {
        if (items.length === 0) return [];
        try {
            const prompt = PromptBuilder.buildLabelBatchPrompt(items);
            const response = await this.client.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are an accessibility expert. Return valid JSON only." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            });
            const content = response.choices[0].message.content || '[]';
            let results: any[] = [];
            try {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) results = parsed;
                else if (parsed.results && Array.isArray(parsed.results)) results = parsed.results;
                else results = Object.values(parsed).find(v => Array.isArray(v)) as any[] || [];
            } catch (e) { }

            return results.map((r: any) => ({
                id: r.id,
                result: r.label || ''
            }));
        } catch (error) {
            console.error("OpenAI Batch Error:", error);
            return [];
        }
    }

    async validateSemanticChangeBatch(items: BatchItem[]): Promise<BatchResult[]> {
        if (items.length === 0) return [];
        try {
            const prompt = PromptBuilder.buildValidationBatchPrompt(items);
            const response = await this.client.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are an accessibility expert. Return valid JSON only." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            });
            const content = response.choices[0].message.content || '[]';
            let results: any[] = [];
            try {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) results = parsed;
                else if (parsed.results && Array.isArray(parsed.results)) results = parsed.results;
                else results = Object.values(parsed).find(v => Array.isArray(v)) as any[] || [];
            } catch (e) { }

            return results.map((r: any) => ({
                id: r.id,
                result: r.isValid ? "VALID" : "INVALID",
                isValid: r.isValid,
                reasoning: r.reasoning
            }));
        } catch (error) {
            console.error("OpenAI Batch Error:", error);
            return [];
        }
    }

    async validateInteractiveRoleBatch(items: BatchItem[]): Promise<BatchResult[]> {
        if (items.length === 0) return [];
        try {
            const prompt = PromptBuilder.buildInteractiveValidationBatchPrompt(items);
            const response = await this.client.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are an accessibility expert. Return valid JSON only." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            });
            const content = response.choices[0].message.content || '[]';
            let results: any[] = [];
            try {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) results = parsed;
                else if (parsed.results && Array.isArray(parsed.results)) results = parsed.results;
                else results = Object.values(parsed).find(v => Array.isArray(v)) as any[] || [];
            } catch (e) { }

            return results.map((r: any) => ({
                id: r.id,
                result: r.isValid ? "VALID" : "INVALID",
                isValid: r.isValid,
                reasoning: r.reasoning
            }));
        } catch (error) {
            console.error("OpenAI Batch Error:", error);
            return [];
        }
    }
}

import { AICache } from '../cache';

export class Fixer {
    private ai: AIGenerator | null;
    private cache: AICache;

    constructor(ai?: AIGenerator) {
        this.ai = ai || null;
        this.cache = new AICache();
    }

    async fix(issues: Issue[]): Promise<Fix[]> {
        const fixes: Fix[] = [];

        // Group issues
        const groups: Record<string, Issue[]> = {
            'missing-alt': [],
            'missing-label': [],
            'svg-accessibility': [],
            'missing-landmark': [],
            'other': []
        };

        for (const issue of issues) {
            if (issue.issueType === 'missing-alt' || issue.issueType === 'missing-alt-bg') {
                groups['missing-alt'].push(issue);
            } else if (issue.issueType === 'missing-label') {
                groups['missing-label'].push(issue);
            } else if (issue.issueType === 'svg-accessibility') {
                groups['svg-accessibility'].push(issue);
            } else if (issue.issueType === 'missing-landmark') {
                groups['missing-landmark'].push(issue);
            } else {
                groups['other'].push(issue);
            }
        }

        // Process batches (Only if AI is available)
        if (this.ai) {
            await this.processAltTextBatch(groups['missing-alt'], fixes);
            await this.processLabelBatch(groups['missing-label'], fixes);
            await this.processSvgBatch(groups['svg-accessibility'], fixes);
            await this.processLandmarkBatch(groups['missing-landmark'], fixes);
            await this.processInteractiveBatch(groups['other'], fixes);
        } else {
            // Basic Mode: Apply deterministic fixes where possible
            // For missing alt, we can't generate text, but we can add empty alt if decorative? No, risky.
            // For SVG, we can add role="img" but no label.
            this.processSvgBasic(groups['svg-accessibility'], fixes);
        }

        // Process others (Deterministic or Basic)
        this.processOthers(groups['other'], fixes);

        return this.cleanupFixes(fixes);
    }

    private processSvgBasic(issues: Issue[], fixes: Fix[]) {
        for (const issue of issues) {
            // Always add role=img fix
            fixes.push({
                fixType: 'add-attribute',
                selector: issue.selector,
                payload: { attribute: 'role', value: 'img' },
                metadata: { context: issue.context, signature: issue.signature }
            });
        }
    }

    private async processInteractiveBatch(issues: Issue[], fixes: Fix[]) {
        const interactiveIssues = issues.filter(i => i.issueType === 'interactive-role');
        if (interactiveIssues.length === 0 || !this.ai) return;

        const batchItems: BatchItem[] = [];
        const signatureMap = new Map<string, BatchResult>();

        for (const issue of interactiveIssues) {
            const key = this.cache.generateKey(issue.signature);
            const cached = this.cache.get(key);
            if (cached) {
                signatureMap.set(key, cached);
                continue;
            }
            if (signatureMap.has(key)) continue;

            batchItems.push({
                id: key,
                selector: issue.selector,
                context: issue.signature?.context || issue.context,
                signature: issue.signature
            });
            signatureMap.set(key, { id: key, result: 'PENDING', isValid: false });
        }

        if (batchItems.length > 0) {
            const results = await this.ai.validateInteractiveRoleBatch(batchItems);
            for (const res of results) {
                this.cache.set(res.id, res);
                signatureMap.set(res.id, res);
            }
        }

        // Filter out invalid interactive issues from the 'other' group so they don't get processed by processOthers
        // Actually, processOthers iterates 'other' group. We should modify the 'other' group or handle it here.
        // Better: handle interactive-role entirely here and remove from processOthers logic.
    }

    private processOthers(issues: Issue[], fixes: Fix[]) {
        for (const issue of issues) {
            if (issue.issueType === 'semantic-div-button' || issue.issueType === 'semantic-link-button') {
                fixes.push({
                    fixType: 'convert-tag',
                    selector: issue.selector,
                    payload: { tagName: 'button', attributes: { type: 'button' } },
                    metadata: { context: issue.context, signature: issue.signature }
                });
            }
        }
    }

    private cleanupFixes(fixes: Fix[]): Fix[] {
        const convertToButtonSelectors = new Set<string>();

        // 1. Identify button conversions
        for (const fix of fixes) {
            if (fix.fixType === 'convert-tag' && fix.payload.tagName === 'button') {
                convertToButtonSelectors.add(fix.selector);
            }
        }

        // 2. Identify nested conversions (simple prefix check for now, assuming unique path selectors)
        const nestedConversionsToRemove = new Set<string>();
        for (const parent of convertToButtonSelectors) {
            for (const child of convertToButtonSelectors) {
                if (parent !== child && child.includes(parent)) {
                    // Note: includes() is a weak check, ideally we check for path hierarchy.
                    // But given we want to be safe, avoiding nested buttons is priority.
                    nestedConversionsToRemove.add(child);
                }
            }
        }

        return fixes.filter(fix => {
            // Remove nested button conversions
            if (fix.fixType === 'convert-tag' && fix.payload.tagName === 'button') {
                if (nestedConversionsToRemove.has(fix.selector)) return false;
            }

            // Remove redundant attributes
            if (convertToButtonSelectors.has(fix.selector) && !nestedConversionsToRemove.has(fix.selector)) {
                if (fix.fixType === 'add-attribute' && (fix.payload.attribute === 'role' || fix.payload.attribute === 'tabindex')) {
                    return false;
                }
            }
            return true;
        });
    }

    private async processAltTextBatch(issues: Issue[], fixes: Fix[]) {
        if (issues.length === 0 || !this.ai) return;

        const batchItems: BatchItem[] = [];
        const signatureMap = new Map<string, string>();

        for (const issue of issues) {
            const key = this.cache.generateKey(issue.signature);

            // Check cache
            const cached = this.cache.get(key);
            if (cached) {
                signatureMap.set(key, cached);
                continue;
            }

            // Dedupe within current batch
            if (signatureMap.has(key)) continue;

            // Add to batch
            batchItems.push({
                id: key,
                selector: issue.selector,
                context: issue.signature?.context || issue.context,
                signature: issue.signature
            });
            signatureMap.set(key, 'PENDING');
        }

        if (batchItems.length > 0) {
            const results = await this.ai.generateAltTextBatch(batchItems);
            for (const res of results) {
                this.cache.set(res.id, res.result);
                signatureMap.set(res.id, res.result);
            }
        }

        // Apply fixes
        for (const issue of issues) {
            const key = this.cache.generateKey(issue.signature);
            const result = signatureMap.get(key);
            if (result && result !== 'PENDING') {
                const attr = issue.issueType === 'missing-alt-bg' ? 'aria-label' : 'alt';
                fixes.push({
                    fixType: 'add-attribute',
                    selector: issue.selector,
                    payload: { attribute: attr, value: result },
                    metadata: { context: issue.context, signature: issue.signature }
                });
            }
        }
    }

    private async processLabelBatch(issues: Issue[], fixes: Fix[]) {
        if (issues.length === 0 || !this.ai) return;

        const batchItems: BatchItem[] = [];
        const signatureMap = new Map<string, string>();

        for (const issue of issues) {
            const key = this.cache.generateKey(issue.signature);
            if (this.cache.get(key)) {
                signatureMap.set(key, this.cache.get(key));
                continue;
            }
            if (signatureMap.has(key)) continue;

            batchItems.push({
                id: key,
                selector: issue.selector,
                context: issue.signature?.context || issue.context,
                signature: issue.signature
            });
            signatureMap.set(key, 'PENDING');
        }

        if (batchItems.length > 0) {
            const results = await this.ai.generateLabelBatch(batchItems);
            for (const res of results) {
                this.cache.set(res.id, res.result);
                signatureMap.set(res.id, res.result);
            }
        }

        for (const issue of issues) {
            const key = this.cache.generateKey(issue.signature);
            const result = signatureMap.get(key);
            if (result && result !== 'PENDING') {
                fixes.push({
                    fixType: 'add-attribute',
                    selector: issue.selector,
                    payload: { attribute: 'aria-label', value: result },
                    metadata: { context: issue.context, signature: issue.signature }
                });
            }
        }
    }

    private async processSvgBatch(issues: Issue[], fixes: Fix[]) {
        // Similar to AltText but adds role="img" and checks existing label
        if (issues.length === 0 || !this.ai) return;

        const batchItems: BatchItem[] = [];
        const signatureMap = new Map<string, string>();

        for (const issue of issues) {
            // Always add role=img fix first
            fixes.push({
                fixType: 'add-attribute',
                selector: issue.selector,
                payload: { attribute: 'role', value: 'img' },
                metadata: { context: issue.context, signature: issue.signature }
            });

            // Check existing label
            const existingLabel = issue.context?.attributes?.['aria-label'] || issue.context?.attributes?.['aria-labelledby'];
            if (existingLabel) continue;

            const key = this.cache.generateKey(issue.signature);
            if (this.cache.get(key)) {
                signatureMap.set(key, this.cache.get(key));
                continue;
            }
            if (signatureMap.has(key)) continue;

            batchItems.push({
                id: key,
                selector: issue.selector,
                context: issue.signature?.context || issue.context,
                signature: issue.signature
            });
            signatureMap.set(key, 'PENDING');
        }

        if (batchItems.length > 0) {
            // Re-use generateAltTextBatch for SVGs
            const results = await this.ai.generateAltTextBatch(batchItems);
            for (const res of results) {
                this.cache.set(res.id, res.result);
                signatureMap.set(res.id, res.result);
            }
        }

        for (const issue of issues) {
            const existingLabel = issue.context?.attributes?.['aria-label'] || issue.context?.attributes?.['aria-labelledby'];
            if (existingLabel) continue;

            const key = this.cache.generateKey(issue.signature);
            const result = signatureMap.get(key);
            if (result && result !== 'PENDING') {
                fixes.push({
                    fixType: 'add-attribute',
                    selector: issue.selector,
                    payload: { attribute: 'aria-label', value: result },
                    metadata: { context: issue.context, signature: issue.signature }
                });
            }
        }
    }

    private async processLandmarkBatch(issues: Issue[], fixes: Fix[]) {
        if (issues.length === 0 || !this.ai) return;

        const batchItems: BatchItem[] = [];
        const signatureMap = new Map<string, BatchResult>();

        for (const issue of issues) {
            if (!issue.context?.landmark) continue;

            const key = this.cache.generateKey(issue.signature);
            const cached = this.cache.get(key);
            if (cached) {
                signatureMap.set(key, cached);
                continue;
            }
            if (signatureMap.has(key)) continue;

            batchItems.push({
                id: key,
                selector: issue.selector,
                context: issue.signature?.context || issue.context,
                signature: issue.signature
            });
            // Mark pending
            signatureMap.set(key, { id: key, result: 'PENDING', isValid: false });
        }

        if (batchItems.length > 0) {
            const results = await this.ai.validateSemanticChangeBatch(batchItems);
            for (const res of results) {
                this.cache.set(res.id, res); // Cache the whole result object
                signatureMap.set(res.id, res);
            }
        }

        for (const issue of issues) {
            if (!issue.context?.landmark) continue;
            const key = this.cache.generateKey(issue.signature);
            const result = signatureMap.get(key);

            if (result && result.isValid) {
                fixes.push({
                    fixType: 'convert-tag',
                    selector: issue.selector,
                    payload: { tagName: issue.context.landmark },
                    metadata: {
                        context: issue.context,
                        signature: issue.signature,
                        reasoning: result.reasoning
                    }
                });
            } else if (result && !result.isValid && result.result !== 'PENDING') {
                console.log(`Skipping fix for ${issue.selector}: ${result.reasoning}`);
            }
        }
    }
}
