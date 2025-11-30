import * as ts from 'typescript';
// @ts-ignore
import * as compiler from 'vue-template-compiler';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export class Validator {
    async validate(filePath: string, content: string): Promise<ValidationResult> {
        if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
            return this.validateTypeScript(filePath, content);
        } else if (filePath.endsWith('.vue')) {
            return this.validateVue(filePath, content);
        }

        // Default: Assume valid for other types (HTML, CSS) for now
        return { isValid: true, errors: [] };
    }

    private validateTypeScript(fileName: string, content: string): ValidationResult {
        // Create a source file
        const sourceFile = ts.createSourceFile(
            fileName,
            content,
            ts.ScriptTarget.Latest,
            true
        );

        // Check for syntax errors
        // We can't easily run full type checking without a program, but we can check for parse errors.
        // Actually, createSourceFile doesn't report errors directly in a simple way unless we traverse?
        // No, we can use ts.transpileModule to check for syntactic errors.

        const result = ts.transpileModule(content, {
            compilerOptions: { noEmit: true, jsx: ts.JsxEmit.React },
            reportDiagnostics: true,
            fileName: fileName
        });

        if (result.diagnostics && result.diagnostics.length > 0) {
            const errors = result.diagnostics.map(d => {
                const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
                if (d.file) {
                    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start!);
                    return `${fileName} (${line + 1},${character + 1}): ${message}`;
                }
                return message;
            });
            return { isValid: false, errors };
        }

        return { isValid: true, errors: [] };
    }

    private validateVue(fileName: string, content: string): ValidationResult {
        const parsed = compiler.parseComponent(content);
        const errors: string[] = [];

        // Check template errors
        if (parsed.template) {
            const templateResult = compiler.compile(parsed.template.content);
            if (templateResult.errors && templateResult.errors.length > 0) {
                errors.push(...templateResult.errors.map((e: any) => `Template Error: ${e}`));
            }
        }

        // Check script errors (extract script and validate as TS/JS)
        if (parsed.script) {
            const scriptContent = parsed.script.content;
            const lang = parsed.script.lang || 'js';
            const scriptFileName = fileName + '.' + lang; // e.g. file.vue.ts

            const scriptResult = this.validateTypeScript(scriptFileName, scriptContent);
            if (!scriptResult.isValid) {
                errors.push(...scriptResult.errors);
            }
        }

        // Check script setup
        if ((parsed as any).scriptSetup) {
            const scriptContent = (parsed as any).scriptSetup.content;
            const lang = (parsed as any).scriptSetup.lang || 'js';
            const scriptFileName = fileName + '.setup.' + lang;

            const scriptResult = this.validateTypeScript(scriptFileName, scriptContent);
            if (!scriptResult.isValid) {
                errors.push(...scriptResult.errors);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}
