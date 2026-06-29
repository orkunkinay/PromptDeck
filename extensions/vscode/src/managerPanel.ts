import * as vscode from "vscode";
import { respondToManagerRequest, type ManagerBridgeDependencies, type ManagerRequest } from "./managerBridge";

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

export class PromptDeckManagerPanel {
  private static current: PromptDeckManagerPanel | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly dependencies: ManagerBridgeDependencies
  ) {
    this.panel.onDidDispose(() => {
      if (PromptDeckManagerPanel.current === this) PromptDeckManagerPanel.current = undefined;
    });
    this.panel.webview.onDidReceiveMessage((message: ManagerRequest) => {
      void this.handleMessage(message);
    });
    this.panel.webview.html = this.html();
  }

  static open(extensionUri: vscode.Uri, dependencies: ManagerBridgeDependencies): void {
    if (PromptDeckManagerPanel.current) {
      PromptDeckManagerPanel.current.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel("promptdeck.manager", "PromptDeck", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist", "webview"), vscode.Uri.joinPath(extensionUri, "resources")]
    });
    PromptDeckManagerPanel.current = new PromptDeckManagerPanel(panel, extensionUri, dependencies);
  }

  private async handleMessage(message: ManagerRequest): Promise<void> {
    const response = await respondToManagerRequest(message, this.dependencies);
    await this.panel.webview.postMessage({ type: "RESPONSE", ...response });
  }

  private html(): string {
    const webview = this.panel.webview;
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "manager.js"));
    const styles = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "manager.css"));
    const logo = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "resources", "logo.png"));
    const token = nonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${token}'`
    ].join("; ");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styles}" rel="stylesheet">
    <title>PromptDeck</title>
  </head>
  <body>
    <div id="root" data-logo-uri="${logo}"></div>
    <script nonce="${token}" src="${script}"></script>
  </body>
</html>`;
  }
}
