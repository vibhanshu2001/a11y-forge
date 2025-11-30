#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config'; // Load environment variables
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { Scanner } from '../core/scanner';
import { Detector } from '../core/detector';
import { Fixer, OpenAIGenerator, MockAIGenerator } from '../core/fixer';
import { Patcher } from '../core/patcher';
import { Validator } from '../core/validator';
import { AutoHealer } from '../core/healer';

import { ConfigManager } from '../core/config';

const program = new Command();
const configManager = new ConfigManager();

program
    .name('a11y-forge')
    .description('Accessibility Auto-Fix Engine')
    .version('1.0.0');

program
    .command('config')
    .description('Manage configuration')
    .argument('<action>', 'Action to perform (set, get, delete)')
    .argument('[key]', 'Configuration key')
    .argument('[value]', 'Configuration value')
    .action((action, key, value) => {
        if (action === 'set') {
            if (!key || !value) {
                console.error(chalk.red('Error: key and value are required for set action.'));
                return;
            }
            configManager.set(key, value);
            console.log(chalk.green(`Configuration updated: ${key} = ${value}`));
        } else if (action === 'get') {
            if (!key) {
                console.error(chalk.red('Error: key is required for get action.'));
                return;
            }
            const val = configManager.get(key);
            console.log(val !== undefined ? val : chalk.gray('undefined'));
        } else if (action === 'delete') {
            if (!key) {
                console.error(chalk.red('Error: key is required for delete action.'));
                return;
            }
            configManager.delete(key);
            console.log(chalk.green(`Configuration deleted: ${key}`));
        } else {
            console.error(chalk.red('Invalid action. Use set, get, or delete.'));
        }
    });

program
    .command('scan <target>')
    .description('Scan a URL or local folder for accessibility issues')
    .option('--fix', 'Generate fixes and patch file')
    .option('--output <file>', 'Output patch file path')
    .option('--apply', 'Apply fixes directly to source files (Local only)')
    .option('--verify', 'Verify fixes without applying (Dry Run)')
    .option('--ci', 'Exit with non-zero code if severe issues found')
    .action(async (target, options) => {
        console.log(chalk.blue(`Starting scan for: ${target}`));

        const isUrl = target.startsWith('http');

        // Smart Defaults
        if (options.fix === undefined) {
            options.fix = true;
        }

        if (isUrl) {
            if (options.apply) {
                console.error(chalk.red('Error: --apply can only be used with local files/folders.'));
                process.exit(1);
            }
            // Default output for URL if fixing
            if (options.fix && !options.output) {
                try {
                    const domain = new URL(target).hostname;
                    options.output = `${domain}.patch`;
                    console.log(chalk.blue(`Output not specified. Will save patch to: ${options.output}`));
                } catch (e) {
                    options.output = 'fixes.patch';
                }
            }
        } else {
            // Local: Auto-apply if not specified
            if (options.apply === undefined && options.fix) {
                options.apply = true;
                console.log(chalk.blue('Local target detected. Auto-applying fixes.'));
            }
        }

        const scanner = new Scanner();
        const detector = new Detector();

        const apiKey = process.env.OPENAI_API_KEY || configManager.get('OPENAI_API_KEY');
        let aiGenerator: OpenAIGenerator | MockAIGenerator | undefined;

        if (apiKey) {
            aiGenerator = new OpenAIGenerator(apiKey);
            console.log(chalk.green('Using OpenAI for fix generation.'));
        } else {
            console.log(chalk.yellow('No OpenAI API Key found. Running in Basic Fix Mode (Deterministic fixes only).'));
            console.log(chalk.gray('Tip: Set your API key with: a11y-fix config set OPENAI_API_KEY <key>'));
        }

        const fixer = new Fixer(aiGenerator);
        const patcher = new Patcher();

        try {
            // 1. Scan
            const snapshots = await scanner.scan(target);
            console.log(chalk.green(`Scan complete. Scanned ${snapshots.length} pages.`));

            let allIssues: any[] = [];
            let allFixes: any[] = [];
            let combinedPatch = '';

            for (const snapshot of snapshots) {
                console.log(chalk.blue(`\nProcessing: ${snapshot.url} (${snapshot.title})`));

                // 2. Detect
                const issues = detector.detect(snapshot);
                console.log(chalk.yellow(`Found ${issues.length} issues.`));

                issues.forEach(issue => {
                    const color = issue.severity === 'critical' ? chalk.red :
                        issue.severity === 'serious' ? chalk.magenta :
                            issue.severity === 'moderate' ? chalk.yellow : chalk.gray;
                    console.log(color(`[${issue.severity.toUpperCase()}] ${issue.issueType}: ${issue.message}`));
                    console.log(chalk.gray(`  Selector: ${issue.selector}`));
                    allIssues.push(issue);
                });

                // 3. Fix (Optional)
                if (options.fix && issues.length > 0) {
                    console.log(chalk.blue('Generating fixes...'));
                    const fixes = await fixer.fix(issues);
                    console.log(chalk.green(`Generated ${fixes.length} fixes.`));
                    allFixes.push(...fixes);

                    let originalHtml = snapshot.html;
                    let localPath: string | null = snapshot.filePath || null;

                    // Fallback for file:// URLs if filePath not set (legacy/direct file scan)
                    if (!localPath && snapshot.url.startsWith('file://')) {
                        localPath = snapshot.url.replace('file://', '');
                    }

                    // Source Mapping: If scanning dist/build, try to find source file
                    if (localPath && (localPath.includes('/dist/') || localPath.includes('/build/'))) {
                        const possibleSources = [
                            localPath.replace(/\/dist\/|\/build\//, '/public/'),
                            localPath.replace(/\/dist\/|\/build\//, '/src/'),
                            localPath.replace(/\/dist\/|\/build\//, '/'),
                        ];

                        for (const src of possibleSources) {
                            if (fs.existsSync(src)) {
                                console.log(chalk.yellow(`Detected build artifact. Redirecting fixes to source: ${src}`));
                                localPath = src;
                                break;
                            }
                        }
                    }

                    // Read from disk if we have a local path to ensure we patch source
                    if (localPath && fs.existsSync(localPath)) {
                        originalHtml = fs.readFileSync(localPath, 'utf-8');
                    }

                    // Universal Patching Logic
                    const { SourceSearcher } = require('../core/search');
                    const { ReactPatcher } = require('../core/patcher/react');
                    const { VuePatcher } = require('../core/patcher/vue');

                    const searcher = new SourceSearcher();

                    // Group fixes by source file
                    const fixesByFile = new Map<string, any[]>();

                    for (const fix of fixes) {
                        let sourceFile = '';
                        let sourceLine = 0;

                        // 1. Use Signature Search to find source file and line
                        if (fix.metadata?.signature) {
                            console.log(chalk.gray(`  Searching source for signature: ${fix.metadata.signature.tag} "${fix.metadata.signature.text || ''}"...`));
                            const match = await searcher.find(fix.metadata.signature, process.cwd());

                            if (match) {
                                console.log(chalk.green(`  Found match in ${path.relative(process.cwd(), match.file)} at line ${match.line} (Score: ${match.score})`));
                                sourceFile = match.file;
                                sourceLine = match.line;

                                // Update fix metadata with resolved location
                                if (!fix.metadata) fix.metadata = {};
                                fix.metadata.sourceLocation = {
                                    source: sourceFile,
                                    line: sourceLine,
                                    column: match.column,
                                    closingLocation: match.node.closingLocation
                                };
                            } else {
                                console.warn(chalk.yellow(`  No source match found for issue.`));
                            }
                        }

                        // 2. Fallback: If no signature match, check if we have a local file path from scan
                        if (!sourceFile && localPath && fs.existsSync(localPath)) {
                            // This is likely a static HTML file scan
                            sourceFile = localPath;
                            console.log(chalk.gray(`  Using scanned file as source: ${sourceFile}`));
                        }

                        if (sourceFile) {
                            if (!fixesByFile.has(sourceFile)) fixesByFile.set(sourceFile, []);
                            fixesByFile.get(sourceFile)!.push(fix);
                        }
                    }

                    for (const [file, fileFixes] of fixesByFile) {
                        if (!fs.existsSync(file)) continue;

                        console.log(chalk.blue(`Applying fixes to ${file}...`));
                        let modifiedContent = '';

                        if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
                            const reactPatcher = new ReactPatcher();
                            modifiedContent = reactPatcher.applyFixes(file, fileFixes);
                        } else if (file.endsWith('.vue')) {
                            const vuePatcher = new VuePatcher();
                            modifiedContent = vuePatcher.applyFixes(file, fileFixes);
                        } else {
                            // Default HTML/Text patcher
                            const content = fs.readFileSync(file, 'utf-8');
                            modifiedContent = patcher.applyFixes(content, fileFixes);
                        }

                        if (modifiedContent) {
                            // 4. Validate & Heal
                            const validator = new Validator();
                            const autoHealer = new AutoHealer(aiGenerator);

                            if (options.apply || options.verify) {
                                console.log(chalk.blue(`  Validating changes for ${path.basename(file)}...`));
                                let validation = await validator.validate(file, modifiedContent);

                                if (!validation.isValid) {
                                    console.warn(chalk.yellow(`  Validation failed with ${validation.errors.length} errors.`));
                                    if (apiKey) {
                                        console.log(chalk.blue(`  Attempting Auto-Heal...`));
                                        modifiedContent = await autoHealer.heal(modifiedContent, validation.errors, file);

                                        // Re-validate
                                        validation = await validator.validate(file, modifiedContent);
                                        if (validation.isValid) {
                                            console.log(chalk.green(`  Auto-Heal successful!`));
                                        } else {
                                            console.error(chalk.red(`  Auto-Heal failed.`));
                                            console.error(chalk.red(`  Errors: ${validation.errors.join(', ')}`));
                                            if (options.verify) {
                                                console.error(chalk.red(`  Verification Failed for ${file}`));
                                            }
                                            continue; // Skip saving
                                        }
                                    } else {
                                        console.warn(chalk.yellow(`  Skipping file update due to validation errors (No API Key for Auto-Heal).`));
                                        if (options.verify) {
                                            console.error(chalk.red(`  Verification Failed for ${file}`));
                                        }
                                        continue;
                                    }
                                } else {
                                    if (options.verify) {
                                        console.log(chalk.green(`  Verification Passed for ${file}`));
                                    }
                                }
                            }

                            if (options.apply) {
                                fs.writeFileSync(file, modifiedContent);
                                console.log(chalk.green(`Updated ${file}`));
                            }
                        }
                    }
                    // Generate Patch
                    let filename = path.basename(snapshot.url);
                    if (localPath) {
                        filename = path.relative(process.cwd(), localPath);
                    } else {
                        // For URLs, we can't really patch source easily. Use URL path.
                        try {
                            filename = new URL(snapshot.url).pathname;
                            if (filename === '/') filename = 'index.html';
                        } catch (e) { filename = 'index.html'; }
                    }

                    const patch = patcher.generatePatch(originalHtml, fixes, filename);
                    if (patch) {
                        combinedPatch += patch + '\n';
                    }
                }
            }


            if (options.fix && !options.apply) {
                if (options.output) {
                    fs.writeFileSync(options.output, combinedPatch);
                    console.log(chalk.green(`\nCombined patch written to ${options.output}`));
                } else {
                    console.log(chalk.gray('\nPatch output (use --output to save):'));
                    console.log(combinedPatch);
                }
            }

            // 4. Exit Code
            if (options.ci) {
                const hasSevere = allIssues.some(i => i.severity === 'critical' || i.severity === 'serious');
                if (hasSevere) {
                    console.error(chalk.red('CI Failure: Severe accessibility issues found.'));
                    process.exit(1);
                }
            }

        } catch (error) {
            console.error(chalk.red('Error during execution:'), error);
            process.exit(2);
        } finally {
            await scanner.close();

            // Cleanup cache file
            const cachePath = path.join(process.cwd(), '.a11y-cache.json');
            if (fs.existsSync(cachePath)) {
                try {
                    fs.unlinkSync(cachePath);
                    // console.log(chalk.gray('Cleaned up temporary cache file.'));
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }
    });

program.parse(process.argv);
