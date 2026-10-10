import * as vscode from 'vscode';

export interface AgentAction {
    action: 'create_file' | 'edit_file' | 'none';
    filename?: string;
    content?: string;
    terminalCommand?: string;
    message: string;
}

export const pendingChanges = new Map<string, { targetUri: vscode.Uri; newContent: string }>();

let activeCopilotTerminal: vscode.Terminal | undefined;

export function runInTerminal(command: string) {
    if (!activeCopilotTerminal || activeCopilotTerminal.exitStatus !== undefined) {
        activeCopilotTerminal = vscode.window.createTerminal({
            name: "⚡ Copilot Terminal",
            iconPath: new vscode.ThemeIcon("terminal")
        });
    }
    activeCopilotTerminal.show(false);
    activeCopilotTerminal.sendText(command, true);
}

export async function executeAgentAction(agentAction: AgentAction): Promise<{ status: string; pendingId?: string }> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        throw new Error("No open workspace folder found. Please open a folder in VS Code first.");
    }

    const rootUri = vscode.workspace.workspaceFolders[0].uri;

    if (agentAction.action === 'create_file' || agentAction.action === 'edit_file') {
        if (!agentAction.filename || agentAction.content === undefined) {
            return { status: "Action failed: Missing filename or content." };
        }

        const targetUri = vscode.Uri.joinPath(rootUri, agentAction.filename);
        let fileExists = false;

        try {
            await vscode.workspace.fs.readFile(targetUri);
            fileExists = true;
        } catch {
            fileExists = false;
        }

        if (fileExists) {
            const changeId = `change_${Date.now()}`;
            pendingChanges.set(changeId, { targetUri, newContent: agentAction.content });

            const originalDoc = await vscode.workspace.openTextDocument(targetUri);
            const previewDoc = await vscode.workspace.openTextDocument({
                content: agentAction.content,
                language: originalDoc.languageId
            });

            await vscode.commands.executeCommand(
                'vscode.diff',
                targetUri,
                previewDoc.uri,
                `Diff: ${agentAction.filename} (Current ↔ Proposed AI Fix)`
            );

            return {
                status: `Proposed modifications for ${agentAction.filename}. Review diff and Accept/Reject.`,
                pendingId: changeId
            };
        } else {
            const fileData = new TextEncoder().encode(agentAction.content);
            await vscode.workspace.fs.writeFile(targetUri, fileData);
            const doc = await vscode.workspace.openTextDocument(targetUri);
            await vscode.window.showTextDocument(doc, { preview: false });

            return { status: `Successfully created and opened ${agentAction.filename}` };
        }
    }

    return { status: "No file modifications required." };
}

export async function resolvePendingChange(changeId: string, accept: boolean): Promise<string> {
    const item = pendingChanges.get(changeId);
    if (!item) return "No pending changes found or already resolved.";

    if (accept) {
        const fileData = new TextEncoder().encode(item.newContent);
        await vscode.workspace.fs.writeFile(item.targetUri, fileData);
        pendingChanges.delete(changeId);
        return "Changes accepted and saved to disk.";
    } else {
        pendingChanges.delete(changeId);
        return "Changes discarded.";
    }
}