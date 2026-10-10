import * as vscode from 'vscode';
import * as path from 'path';
import { SidebarProvider, ExtensionConfig, KeyItem } from './sidebarProvider';
import { executeAgentAction, resolvePendingChange, runInTerminal, AgentAction } from './agentTools';

export function activate(context: vscode.ExtensionContext) {
    let conversationHistory: any[] = [];

    const getConfig = (): ExtensionConfig => {
        return {
            provider: context.globalState.get<string>('ai_copilot_provider', 'google'),
            model: context.globalState.get<string>('ai_copilot_model', 'gemini-3.8-flash'),
            autoRotate: context.globalState.get<boolean>('ai_copilot_autorotate', true),
            keys: context.globalState.get<KeyItem[]>('ai_copilot_keys_pool', [])
        };
    };

    const saveConfig = (cfg: ExtensionConfig) => {
        context.globalState.update('ai_copilot_provider', cfg.provider);
        context.globalState.update('ai_copilot_model', cfg.model);
        context.globalState.update('ai_copilot_autorotate', cfg.autoRotate);
        context.globalState.update('ai_copilot_keys_pool', cfg.keys);
        vscode.window.showInformationMessage("API pool & settings saved successfully.");
    };

    function getOptimizedEditorContext(editor: vscode.TextEditor | undefined): { fileName: string; code: string } {
       if (!editor) {
    return { fileName: "None", code: "" };
}
        const fileName = path.basename(editor.document.fileName);
        const selection = editor.selection;

        if (!selection.isEmpty) {
            return {
                fileName,
                code: `// Selected Region:\n` + editor.document.getText(selection)
            };
        }

        const totalLines = editor.document.lineCount;
        if (totalLines > 250) {
            const currentLine = selection.active.line;
            const startLine = Math.max(0, currentLine - 60);
            const endLine = Math.min(totalLines - 1, currentLine + 60);
            const range = new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length);
            return {
                fileName,
                code: `// Snippet (Lines ${startLine + 1} to ${endLine + 1}):\n` + editor.document.getText(range)
            };
        }

        return { fileName, code: editor.document.getText() };
    }

    async function callGeminiAgent(
        userText: string,
        files: { name: string; mimeType: string; data: string }[],
        workspaceFiles: string[],
        activeFileName: string,
        activeFileContent: string,
        historyLimit: number
    ): Promise<AgentAction> {
        const config = getConfig();
        const validKeys = config.keys.filter(k => k.key.trim().length > 0);

        if (validKeys.length === 0) {
            throw new Error("No API key configured. Click Settings (⚙️) above and add your Gemini API Key.");
        }

        // Reorder keys: Start with Active key, followed by the rest in priority order
        const activeIndex = validKeys.findIndex(k => k.isActive);
        const sortedKeyQueue: KeyItem[] = [];
        if (activeIndex >= 0) {
            sortedKeyQueue.push(validKeys[activeIndex]);
            validKeys.forEach((k, idx) => {
                if (idx !== activeIndex) sortedKeyQueue.push(k);
            });
        } else {
            sortedKeyQueue.push(...validKeys);
        }

        const systemInstruction = `VSCode Agent.
File: "${activeFileName}" | Files: [${workspaceFiles.slice(0, 6).join(', ')}]
Source:
\`\`\`
${activeFileContent}
\`\`\`

Return JSON only:
{"action":"create_file"|"edit_file"|"none","filename":"path","content":"full code","terminalCommand":"cmd","message":"brief summary"}
No markdown wrappers.`;

        const currentParts: any[] = [];
        for (const file of files) {
            currentParts.push({
                inlineData: { mimeType: file.mimeType, data: file.data }
            });
        }
        currentParts.push({ text: `${systemInstruction}\nCmd: ${userText}` });

        conversationHistory.push({ role: "user", parts: currentParts });
        const trimmedHistory = conversationHistory.slice(-historyLimit);

        let lastErrorText = "";

        // Iterate through keys based on priority
        for (let i = 0; i < sortedKeyQueue.length; i++) {
            const currentKeyItem = sortedKeyQueue[i];
            const activeModel = config.model || 'gemini-3.8-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${currentKeyItem.key.trim()}`;

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: trimmedHistory,
                        generationConfig: {
                            temperature: 0.1,
                            responseMimeType: "application/json",
                            thinkingConfig: { thinkingBudget: 0 }
                        }
                    })
                });

                if (response.status === 429 || response.status === 403) {
                    if (config.autoRotate && i < sortedKeyQueue.length - 1) {
                        vscode.window.showWarningMessage(`Key "${currentKeyItem.label || i + 1}" quota reached. Rotating to next priority key...`);
                        continue;
                    }
                }

                if (response.status === 503) {
                    await new Promise(res => setTimeout(res, 1200));
                    continue;
                }

                if (!response.ok) {
                    lastErrorText = await response.text();
                    if (config.autoRotate && i < sortedKeyQueue.length - 1) continue;
                    break;
                }

                const data = await response.json() as any;
                let rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
                rawJson = rawJson.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();

                conversationHistory.push({ role: "model", parts: [{ text: rawJson }] });

                try {
                    return JSON.parse(rawJson);
                } catch {
                    return { action: 'none', message: rawJson, terminalCommand: "" };
                }

            } catch (err: any) {
                lastErrorText = err.message;
                if (config.autoRotate && i < sortedKeyQueue.length - 1) continue;
            }
        }

        throw new Error(`Execution failed across configured keys. Last error: ${lastErrorText}`);
    }

    const sidebarProvider = new SidebarProvider(
        context.extensionUri,
        async (payload, postMessage) => {
            const editor = vscode.window.activeTextEditor;
            const contextData = getOptimizedEditorContext(editor);

            let workspaceFiles: string[] = [];
            if (vscode.workspace.workspaceFolders) {
                const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 10);
                workspaceFiles = uris.map(u => path.basename(u.fsPath));
            }

            try {
                const decision = await callGeminiAgent(
                    payload.text,
                    payload.files,
                    workspaceFiles,
                    contextData.fileName,
                    contextData.code,
                    payload.historyLimit || 4
                );
                const result = await executeAgentAction(decision);

                postMessage({
                    type: 'response',
                    text: `${result.status ? `⚡ ${result.status}\n\n` : ''}${decision.message}`,
                    pendingId: result.pendingId,
                    terminalCommand: decision.terminalCommand || null,
                    isError: false
                });
            } catch (err: any) {
                let errorTitle = "Configuration or API Error";
                let cleanMessage = err.message || "An unexpected error occurred.";

                if (cleanMessage.includes("No API key configured")) {
                    errorTitle = "Missing API Key";
                } else if (cleanMessage.includes("429") || cleanMessage.includes("quota")) {
                    errorTitle = "Daily Quota Limit Reached (429)";
                    cleanMessage = "Active key(s) exhausted their quota. Switch active key in Settings or add another.";
                }

                postMessage({
                    type: 'response',
                    text: cleanMessage,
                    title: errorTitle,
                    isError: true
                });
            }
        },
        async (changeId, accept, postMessage) => {
            const res = await resolvePendingChange(changeId, accept);
            vscode.window.showInformationMessage(res);
        },
        (command) => {
            runInTerminal(command);
        },
        (cfg) => {
            saveConfig(cfg);
        },
        () => {
            return getConfig();
        }
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("my-copilot.chatView", sidebarProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );
}

export function deactivate() {}