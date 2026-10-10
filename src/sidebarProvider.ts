import * as vscode from 'vscode';

export interface KeyItem {
    id: string;
    label: string;
    key: string;
    isActive: boolean;
}

export interface ExtensionConfig {
    provider: string;
    model: string;
    autoRotate: boolean;
    keys: KeyItem[];
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly onUserPrompt: (
            payload: {
                text: string;
                files: { name: string; mimeType: string; data: string }[];
                historyLimit: number;
            },
            postMessage: (msg: any) => void
        ) => void,
        private readonly onResolveDiff: (changeId: string, accept: boolean, postMessage: (msg: any) => void) => void,
        private readonly onRunCommand: (command: string) => void,
        private readonly onSaveConfig: (config: ExtensionConfig) => void,
        private readonly onGetConfig: () => ExtensionConfig
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendPrompt':
                    this.onUserPrompt(data.payload, (msg) => webviewView.webview.postMessage(msg));
                    break;
                case 'resolveDiff':
                    this.onResolveDiff(data.changeId, data.accept, (msg) => webviewView.webview.postMessage(msg));
                    break;
                case 'runTerminal':
                    this.onRunCommand(data.command);
                    break;
                case 'saveConfig':
                    this.onSaveConfig(data.config);
                    break;
                case 'requestConfig': {
                    const savedConfig = this.onGetConfig();
                    webviewView.webview.postMessage({ type: 'loadConfig', config: savedConfig });
                    break;
                }
            }
        });
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@vscode/codicons@0.0.36/dist/codicon.min.css">
    <style>
        :root {
            --card-bg: var(--vscode-editor-background);
            --card-border: var(--vscode-widget-border, rgba(255, 255, 255, 0.08));
            --user-card-bg: var(--vscode-input-background, #1e1e1e);
            --primary-accent: var(--vscode-focusBorder, #007acc);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
            padding: 8px 10px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0 8px;
            border-bottom: 1px solid var(--card-border);
            margin-bottom: 8px;
        }
        .header-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: var(--vscode-descriptionForeground);
        }
        .header-actions { display: flex; gap: 4px; }
        .btn-header {
            background: transparent;
            border: 1px solid transparent;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 6px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            font-family: inherit;
        }
        .btn-header:hover {
            color: var(--vscode-foreground);
            background-color: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.06));
        }

        .drawer-panel {
            display: none;
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 8px;
            font-size: 12px;
            max-height: 480px;
            overflow-y: auto;
        }
        .drawer-panel.active { display: flex; flex-direction: column; gap: 8px; }
        .setting-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
        }
        .setting-row select, .setting-row input[type="text"] {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--card-border));
            padding: 3px 6px;
            border-radius: 4px;
            outline: none;
            font-size: 11.5px;
        }

        /* API Key Pool Manager */
        .keys-section {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 4px;
            border-top: 1px solid var(--card-border);
            padding-top: 6px;
        }
        .keys-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 160px;
            overflow-y: auto;
        }
        .key-row {
            display: flex;
            align-items: center;
            gap: 6px;
            background: var(--user-card-bg);
            border: 1px solid var(--card-border);
            padding: 5px 6px;
            border-radius: 4px;
        }
        .key-row.active-key {
            border-color: var(--primary-accent);
        }
        .key-input {
            flex: 1;
            background: transparent !important;
            border: 1px solid var(--card-border) !important;
            color: var(--vscode-foreground) !important;
            font-size: 11px !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
        }
        .key-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .icon-btn {
            cursor: pointer;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            padding: 2px;
        }
        .icon-btn:hover { color: var(--vscode-foreground); }
        .btn-add-key {
            background: transparent;
            border: 1px dashed var(--card-border);
            color: var(--vscode-descriptionForeground);
            padding: 4px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
        .btn-add-key:hover { border-color: var(--primary-accent); color: var(--vscode-foreground); }

        .history-list {
            max-height: 160px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .history-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 8px;
            background: var(--user-card-bg);
            border: 1px solid var(--card-border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 11.5px;
        }
        .history-item:hover { border-color: var(--primary-accent); }
        .history-title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 80%;
        }

        #chat-container {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding-right: 4px;
            margin-bottom: 8px;
        }
        #chat-container::-webkit-scrollbar { width: 5px; }
        #chat-container::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }

        .msg-card {
            border-radius: 6px;
            padding: 8px 10px;
            border: 1px solid var(--card-border);
            font-size: 12.5px;
            line-height: 1.5;
            position: relative;
            word-break: break-word;
        }
        .user-card {
            background: var(--user-card-bg);
            border-left: 3px solid var(--primary-accent);
        }
        .bot-card { background: var(--card-bg); }
        .msg-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
        }
        .msg-actions {
            display: flex;
            gap: 6px;
            opacity: 0;
            transition: opacity 0.15s ease;
        }
        .msg-card:hover .msg-actions { opacity: 1; }
        .action-icon {
            cursor: pointer;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        .action-icon:hover { color: var(--vscode-foreground); }

        .att-tag {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 6px;
            margin-top: 6px;
            font-size: 11px;
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--card-border);
            border-radius: 3px;
            color: var(--vscode-descriptionForeground);
        }

        .error-card {
            background: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1));
            border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
            border-radius: 6px;
            padding: 8px 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .error-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            font-size: 11.5px;
            color: var(--vscode-errorForeground, #f48771);
        }
        .error-body { font-size: 11.5px; color: var(--vscode-foreground); }
        .btn-retry {
            align-self: flex-start;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 8px;
            border-radius: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            font-size: 11px;
        }

        .diff-card {
            margin-top: 8px;
            padding: 8px;
            background: var(--user-card-bg);
            border: 1px dashed var(--card-border);
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .diff-row { display: flex; gap: 6px; }
        .btn-diff-action {
            flex: 1;
            padding: 4px 8px;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
        .btn-accept { background: #166534; color: #dcfce7; }
        .btn-reject { background: #7f1d1d; color: #fee2e2; }

        .btn-term {
            margin-top: 6px;
            width: 100%;
            padding: 5px 8px;
            border-radius: 4px;
            background: var(--vscode-button-secondaryBackground, #2d2d2d);
            color: var(--vscode-button-secondaryForeground, #fff);
            border: 1px solid var(--card-border);
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        #input-box {
            border: 1px solid var(--vscode-input-border, var(--card-border));
            background: var(--vscode-input-background);
            border-radius: 6px;
            padding: 6px 8px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        #input-box:focus-within { border-color: var(--primary-accent); }
        textarea {
            width: 100%;
            height: 48px;
            background: transparent;
            color: var(--vscode-input-foreground);
            border: none;
            outline: none;
            resize: none;
            font-family: inherit;
            font-size: 12px;
        }
        .input-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 2px;
        }
        .btn-attach {
            cursor: pointer;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
        }
        .btn-attach:hover { color: var(--vscode-foreground); }
        #file-input { display: none; }
        .btn-send {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 4px 10px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .btn-send:hover { background: var(--vscode-button-hoverBackground); }
        .btn-send:disabled { opacity: 0.4; cursor: not-allowed; }

        #pills-bar { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
        .pill {
            background: var(--user-card-bg);
            border: 1px solid var(--card-border);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .pill-del { cursor: pointer; color: var(--vscode-errorForeground); }
        .loader-row {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            padding: 4px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-title">
            <span class="codicon codicon-sparkle"></span> Copilot Agent
        </div>
        <div class="header-actions">
            <button class="btn-header" id="btn-toggle-history" title="Chat History">
                <span class="codicon codicon-history"></span> History
            </button>
            <button class="btn-header" id="btn-toggle-settings" title="Settings">
                <span class="codicon codicon-settings-gear"></span>
            </button>
            <button class="btn-header" id="btn-new-chat" title="New Session">
                <span class="codicon codicon-add"></span> New
            </button>
        </div>
    </div>

    <!-- History Drawer -->
    <div class="drawer-panel" id="panel-history">
        <div style="font-weight:600;font-size:11px;color:var(--vscode-descriptionForeground)">PREVIOUS SESSIONS</div>
        <div class="history-list" id="history-items-container">
            <div style="color:var(--vscode-descriptionForeground)">No saved sessions yet.</div>
        </div>
    </div>

    <!-- Settings & API Pool Drawer -->
    <div class="drawer-panel" id="panel-settings">
        <div style="font-weight:600;font-size:11px;color:var(--vscode-descriptionForeground)">AI CONFIGURATION</div>
        
        <div class="setting-row">
            <span>Provider:</span>
            <select id="select-provider">
                <option value="google">Google Gemini</option>
                <option value="openai">OpenAI</option>
            </select>
        </div>
        
        <div class="setting-row">
            <span>Model:</span>
            <input type="text" id="input-model" placeholder="gemini-3.8-flash" style="width:140px;" />
        </div>

        <div class="setting-row">
            <span>Auto-Rotate on Quota Hit:</span>
            <input type="checkbox" id="chk-auto-rotate" checked />
        </div>

        <!-- Multi-Key Manager -->
        <div class="keys-section">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;font-size:11px;color:var(--vscode-descriptionForeground)">API KEYS POOL (ORDER = PRIORITY)</span>
            </div>
            
            <div class="keys-list" id="keys-list-container"></div>
            
            <button class="btn-add-key" id="btn-add-key">
                <span class="codicon codicon-add"></span> Add New API Key
            </button>
        </div>

        <button id="btn-save-config" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:4px;margin-top:4px;">
            <span class="codicon codicon-save"></span> Save All Configuration
        </button>

        <div style="border-top:1px solid var(--card-border);margin:4px 0;"></div>
        <div class="setting-row">
            <span>Remember Messages:</span>
            <select id="select-history-limit">
                <option value="2">2 Messages (Minimal Tokens)</option>
                <option value="4" selected>4 Messages (Balanced)</option>
                <option value="8">8 Messages (Deep Memory)</option>
                <option value="15">15 Messages (Maximum Memory)</option>
            </select>
        </div>
    </div>

    <div id="chat-container"></div>
    <div id="pills-bar"></div>

    <div id="input-box">
        <textarea id="prompt-input" placeholder="Ask, paste screenshot (Ctrl+V), or command..."></textarea>
        <div class="input-footer">
            <label class="btn-attach" for="file-input" title="Attach file or image">
                <span class="codicon codicon-attach"></span> Attach
                <input type="file" id="file-input" multiple />
            </label>
            <button class="btn-send" id="btn-send">
                Send <span class="codicon codicon-arrow-right"></span>
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chat-container');
        const promptInput = document.getElementById('prompt-input');
        const sendBtn = document.getElementById('btn-send');
        const fileInput = document.getElementById('file-input');
        const pillsBar = document.getElementById('pills-bar');
        const newChatBtn = document.getElementById('btn-new-chat');
        const toggleHistoryBtn = document.getElementById('btn-toggle-history');
        const toggleSettingsBtn = document.getElementById('btn-toggle-settings');
        const panelHistory = document.getElementById('panel-history');
        const panelSettings = document.getElementById('panel-settings');
        const historyItemsContainer = document.getElementById('history-items-container');
        const selectHistoryLimit = document.getElementById('select-history-limit');
        
        const selectProvider = document.getElementById('select-provider');
        const inputModel = document.getElementById('input-model');
        const chkAutoRotate = document.getElementById('chk-auto-rotate');
        const keysListContainer = document.getElementById('keys-list-container');
        const btnAddKey = document.getElementById('btn-add-key');
        const btnSaveConfig = document.getElementById('btn-save-config');

        let keyPool = [];

        let state = vscode.getState() || {
            messages: [],
            sessions: [],
            currentSessionId: Date.now(),
            historyLimit: 4
        };

        if (!state.sessions) state.sessions = [];
        if (!state.historyLimit) state.historyLimit = 4;
        selectHistoryLimit.value = String(state.historyLimit);

        let attachedFiles = [];
        let lastUserPayload = null;

        vscode.postMessage({ type: 'requestConfig' });

        toggleHistoryBtn.addEventListener('click', () => {
            panelHistory.classList.toggle('active');
            panelSettings.classList.remove('active');
            renderHistoryList();
        });

        toggleSettingsBtn.addEventListener('click', () => {
            panelSettings.classList.toggle('active');
            panelHistory.classList.remove('active');
        });

        selectHistoryLimit.addEventListener('change', () => {
            state.historyLimit = parseInt(selectHistoryLimit.value);
            vscode.setState(state);
        });

        // Key Pool UI Render Functions
        function renderKeys() {
            keysListContainer.innerHTML = '';
            if (keyPool.length === 0) {
                keysListContainer.innerHTML = '<span style="color:var(--vscode-descriptionForeground);font-size:11px;">No API keys configured yet.</span>';
                return;
            }

            keyPool.forEach((item, index) => {
                const row = document.createElement('div');
                row.className = 'key-row ' + (item.isActive ? 'active-key' : '');
                row.innerHTML = \`
                    <input type="radio" name="activeKeyRadio" \${item.isActive ? 'checked' : ''} title="Set as Active Key" />
                    <input type="text" class="key-input" placeholder="Label" value="\${item.label || ''}" style="max-width:70px;" data-idx="\${index}" data-type="label" />
                    <input type="password" class="key-input" placeholder="Paste API Key" value="\${item.key || ''}" data-idx="\${index}" data-type="key" />
                    <div class="key-actions">
                        \${index > 0 ? '<span class="codicon codicon-arrow-up icon-btn" title="Move Up (Higher Priority)"></span>' : ''}
                        \${index < keyPool.length - 1 ? '<span class="codicon codicon-arrow-down icon-btn" title="Move Down (Lower Priority)"></span>' : ''}
                        <span class="codicon codicon-trash icon-btn" title="Delete Key" style="color:var(--vscode-errorForeground)"></span>
                    </div>
                \`;

                // Radio select active key manually
                row.querySelector('input[type="radio"]').onchange = () => {
                    keyPool.forEach((k, i) => k.isActive = (i === index));
                    renderKeys();
                };

                // Label update
                row.querySelector('[data-type="label"]').oninput = (e) => {
                    keyPool[index].label = e.target.value;
                };

                // Key update
                row.querySelector('[data-type="key"]').oninput = (e) => {
                    keyPool[index].key = e.target.value;
                };

                // Priority shift Up
                const btnUp = row.querySelector('.codicon-arrow-up');
                if (btnUp) {
                    btnUp.onclick = () => {
                        const temp = keyPool[index - 1];
                        keyPool[index - 1] = keyPool[index];
                        keyPool[index] = temp;
                        renderKeys();
                    };
                }

                // Priority shift Down
                const btnDown = row.querySelector('.codicon-arrow-down');
                if (btnDown) {
                    btnDown.onclick = () => {
                        const temp = keyPool[index + 1];
                        keyPool[index + 1] = keyPool[index];
                        keyPool[index] = temp;
                        renderKeys();
                    };
                }

                // Delete Key
                row.querySelector('.codicon-trash').onclick = () => {
                    const wasActive = keyPool[index].isActive;
                    keyPool.splice(index, 1);
                    if (wasActive && keyPool.length > 0) {
                        keyPool[0].isActive = true;
                    }
                    renderKeys();
                };

                keysListContainer.appendChild(row);
            });
        }

        btnAddKey.addEventListener('click', () => {
            keyPool.push({
                id: 'key_' + Date.now(),
                label: 'Key ' + (keyPool.length + 1),
                key: '',
                isActive: keyPool.length === 0
            });
            renderKeys();
        });

        btnSaveConfig.addEventListener('click', () => {
            vscode.postMessage({
                type: 'saveConfig',
                config: {
                    provider: selectProvider.value,
                    model: inputModel.value.trim() || 'gemini-3.8-flash',
                    autoRotate: chkAutoRotate.checked,
                    keys: keyPool
                }
            });
            btnSaveConfig.innerHTML = '<span class="codicon codicon-check"></span> Saved!';
            setTimeout(() => {
                btnSaveConfig.innerHTML = '<span class="codicon codicon-save"></span> Save All Configuration';
            }, 1500);
        });

        function saveCurrentSessionToArchive() {
            if (state.messages.length > 0) {
                const firstUserMsg = state.messages.find(m => m.isUser);
                const title = firstUserMsg ? (firstUserMsg.rawText || firstUserMsg.text).slice(0, 30) + '...' : 'Chat Session';
                const existingIndex = state.sessions.findIndex(s => s.id === state.currentSessionId);
                const sessionData = {
                    id: state.currentSessionId,
                    title: title,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    messages: [...state.messages]
                };

                if (existingIndex >= 0) {
                    state.sessions[existingIndex] = sessionData;
                } else {
                    state.sessions.unshift(sessionData);
                }
                vscode.setState(state);
            }
        }

        function renderHistoryList() {
            historyItemsContainer.innerHTML = '';
            if (state.sessions.length === 0) {
                historyItemsContainer.innerHTML = '<div style="color:var(--vscode-descriptionForeground);font-size:11px;">No saved sessions yet.</div>';
                return;
            }

            state.sessions.forEach(sess => {
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = \`
                    <div class="history-title" title="\${sess.title}">\${sess.title} <span style="font-size:10px;color:var(--vscode-descriptionForeground)">(\${sess.timestamp})</span></div>
                    <span class="codicon codicon-trash" style="color:var(--vscode-errorForeground);font-size:12px;" title="Delete Session"></span>
                \`;

                item.querySelector('.history-title').onclick = () => {
                    saveCurrentSessionToArchive();
                    state.currentSessionId = sess.id;
                    state.messages = [...sess.messages];
                    vscode.setState(state);
                    renderMessages();
                    panelHistory.classList.remove('active');
                };

                item.querySelector('.codicon-trash').onclick = (e) => {
                    e.stopPropagation();
                    state.sessions = state.sessions.filter(s => s.id !== sess.id);
                    if (state.currentSessionId === sess.id) {
                        state.messages = [];
                        state.currentSessionId = Date.now();
                    }
                    vscode.setState(state);
                    renderHistoryList();
                    renderMessages();
                };

                historyItemsContainer.appendChild(item);
            });
        }

        function renderMessages() {
            chatContainer.innerHTML = '';
            if (state.messages.length === 0) {
                const welcome = document.createElement('div');
                welcome.className = 'msg-card bot-card';
                welcome.style.color = 'var(--vscode-descriptionForeground)';
                welcome.innerText = "Agent ready. Write code, paste screenshots, or check history.";
                chatContainer.appendChild(welcome);
            } else {
                state.messages.forEach(m => appendDomMessage(m));
            }
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function appendDomMessage(m) {
            if (m.isError) {
                const errCard = document.createElement('div');
                errCard.className = 'error-card';
                errCard.innerHTML = \`
                    <div class="error-title">
                        <span class="codicon codicon-warning"></span> \${m.title || "Rate Limit Reached (429)"}
                    </div>
                    <div class="error-body">\${m.text}</div>
                \`;
                const retryBtn = document.createElement('button');
                retryBtn.className = 'btn-retry';
                retryBtn.innerHTML = '<span class="codicon codicon-refresh"></span> Retry';
                retryBtn.onclick = () => {
                    if (lastUserPayload) triggerSend(lastUserPayload.text, lastUserPayload.files);
                };
                errCard.appendChild(retryBtn);
                chatContainer.appendChild(errCard);
                return;
            }

            const card = document.createElement('div');
            card.className = 'msg-card ' + (m.isUser ? 'user-card' : 'bot-card');

            const meta = document.createElement('div');
            meta.className = 'msg-meta';
            meta.innerHTML = '<span>' + (m.isUser ? 'You' : 'Copilot') + '</span>';

            const actions = document.createElement('div');
            actions.className = 'msg-actions';

            const copyIcon = document.createElement('span');
            copyIcon.className = 'codicon codicon-copy action-icon';
            copyIcon.title = 'Copy';
            copyIcon.onclick = () => {
                navigator.clipboard.writeText(m.rawText || m.text);
                copyIcon.className = 'codicon codicon-check action-icon';
                setTimeout(() => { copyIcon.className = 'codicon codicon-copy action-icon'; }, 1500);
            };
            actions.appendChild(copyIcon);

            if (m.isUser) {
                const editIcon = document.createElement('span');
                editIcon.className = 'codicon codicon-edit action-icon';
                editIcon.title = 'Edit';
                editIcon.onclick = () => {
                    promptInput.value = m.rawText || m.text;
                    if (m.files && m.files.length > 0) attachedFiles = [...m.files];
                    renderPills();
                    promptInput.focus();
                };
                actions.appendChild(editIcon);
            }

            meta.appendChild(actions);
            card.appendChild(meta);

            const content = document.createElement('div');
            content.innerHTML = (m.rawText || m.text)
                .replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>')
                .replace(/\\n/g, '<br/>');
            card.appendChild(content);

            if (m.files && m.files.length > 0) {
                m.files.forEach(f => {
                    const tag = document.createElement('div');
                    tag.className = 'att-tag';
                    tag.innerHTML = '<span class="codicon codicon-file-media"></span> ' + f.name;
                    card.appendChild(tag);
                });
            }

            if (m.pendingId && !m.isUser) {
                const diff = document.createElement('div');
                diff.className = 'diff-card';
                diff.innerHTML = '<div style="font-size:11px;font-weight:600;"><span class="codicon codicon-diff"></span> Proposed Changes Ready</div>';
                const row = document.createElement('div');
                row.className = 'diff-row';
                const bAccept = document.createElement('button');
                bAccept.className = 'btn-diff-action btn-accept';
                bAccept.innerHTML = '<span class="codicon codicon-check"></span> Accept';
                bAccept.onclick = () => {
                    vscode.postMessage({ type: 'resolveDiff', changeId: m.pendingId, accept: true });
                    diff.innerHTML = '<span style="color:#4ade80;font-size:11px;"><span class="codicon codicon-pass"></span> Changes Accepted</span>';
                };
                const bReject = document.createElement('button');
                bReject.className = 'btn-diff-action btn-reject';
                bReject.innerHTML = '<span class="codicon codicon-close"></span> Discard';
                bReject.onclick = () => {
                    vscode.postMessage({ type: 'resolveDiff', changeId: m.pendingId, accept: false });
                    diff.innerHTML = '<span style="color:#f87171;font-size:11px;"><span class="codicon codicon-error"></span> Changes Discarded</span>';
                };
                row.appendChild(bAccept);
                row.appendChild(bReject);
                diff.appendChild(row);
                card.appendChild(diff);
            }

            if (m.terminalCommand && !m.isUser) {
                const termBtn = document.createElement('button');
                termBtn.className = 'btn-term';
                termBtn.innerHTML = '<span class="codicon codicon-terminal"></span> Run: <code>' + m.terminalCommand + '</code>';
                termBtn.onclick = () => {
                    vscode.postMessage({ type: 'runTerminal', command: m.terminalCommand });
                    termBtn.innerHTML = '<span class="codicon codicon-check"></span> Executed in Terminal';
                };
                card.appendChild(termBtn);
            }

            chatContainer.appendChild(card);
        }

        function renderPills() {
            pillsBar.innerHTML = '';
            attachedFiles.forEach((f, idx) => {
                const pill = document.createElement('div');
                pill.className = 'pill';
                pill.innerHTML = '<span class="codicon codicon-file-media"></span> ' + f.name + ' <span class="codicon codicon-close pill-del" onclick="removePill(' + idx + ')"></span>';
                pillsBar.appendChild(pill);
            });
        }

        window.removePill = function(idx) {
            attachedFiles.splice(idx, 1);
            renderPills();
        };

        function processFile(file) {
            if (file.type && file.type.startsWith('image/')) {
                const img = new Image();
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.src = e.target.result;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        let w = img.width, h = img.height;
                        const maxDim = 800;
                        if (w > maxDim || h > maxDim) {
                            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                            else { w = Math.round((w * maxDim) / h); h = maxDim; }
                        }
                        canvas.width = w; canvas.height = h;
                        ctx.drawImage(img, 0, 0, w, h);
                        attachedFiles.push({
                            name: file.name || 'screenshot.jpg',
                            mimeType: 'image/jpeg',
                            data: canvas.toDataURL('image/jpeg', 0.65).split(',')[1]
                        });
                        renderPills();
                    };
                };
                reader.readAsDataURL(file);
            } else {
                const reader = new FileReader();
                reader.onload = () => {
                    attachedFiles.push({
                        name: file.name || 'file.txt',
                        mimeType: file.type || 'text/plain',
                        data: reader.result.split(',')[1]
                    });
                    renderPills();
                };
                reader.readAsDataURL(file);
            }
        }

        fileInput.addEventListener('change', (e) => {
            Array.from(e.target.files).forEach(f => processFile(f));
            fileInput.value = '';
        });

        document.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (const item of items) {
                if (item.kind === 'file') {
                    const blob = item.getAsFile();
                    if (blob) { processFile(blob); e.preventDefault(); }
                }
            }
        });

        newChatBtn.addEventListener('click', () => {
            saveCurrentSessionToArchive();
            state.currentSessionId = Date.now();
            state.messages = [];
            attachedFiles = [];
            lastUserPayload = null;
            renderPills();
            vscode.setState(state);
            renderMessages();
        });

        function triggerSend(text, files) {
            lastUserPayload = { text, files };

            state.messages.push({
                text: text,
                rawText: text,
                files: files ? [...files] : [],
                isUser: true
            });
            vscode.setState(state);
            renderMessages();

            const loader = document.createElement('div');
            loader.id = 'loader';
            loader.className = 'loader-row';
            loader.innerHTML = '<span class="codicon codicon-loading codicon-modifier-spin"></span> Processing request...';
            chatContainer.appendChild(loader);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            sendBtn.disabled = true;

            vscode.postMessage({
                type: 'sendPrompt',
                payload: {
                    text: text,
                    files: files || [],
                    historyLimit: state.historyLimit || 4
                }
            });
        }

        sendBtn.addEventListener('click', () => {
            const text = promptInput.value.trim();
            if (!text && attachedFiles.length === 0) return;
            const filesToSend = [...attachedFiles];
            promptInput.value = '';
            attachedFiles = [];
            renderPills();
            triggerSend(text, filesToSend);
        });

        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendBtn.click();
            }
        });

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.type === 'response') {
                const loader = document.getElementById('loader');
                if (loader) loader.remove();
                sendBtn.disabled = false;
                state.messages.push({
                    text: msg.text,
                    isUser: false,
                    isError: msg.isError || false,
                    title: msg.title || "",
                    pendingId: msg.pendingId,
                    terminalCommand: msg.terminalCommand
                });
                vscode.setState(state);
                renderMessages();
                saveCurrentSessionToArchive();
            } else if (msg.type === 'loadConfig' && msg.config) {
                if (msg.config.provider) selectProvider.value = msg.config.provider;
                if (msg.config.model) inputModel.value = msg.config.model;
                chkAutoRotate.checked = (msg.config.autoRotate !== false);
                keyPool = msg.config.keys || [];
                renderKeys();
            }
        });

        renderMessages();
    </script>
</body>
</html>`;
    }
}