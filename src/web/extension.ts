import * as vscode from "vscode";
import { registerWebOAuthHandler } from "../auth/oauth.web";
import { activate as sharedActivate, deactivate } from "../extension";

export function activate(context: vscode.ExtensionContext) {
	// Register before any connection starts so the OAuth redirect can be caught.
	context.subscriptions.push(registerWebOAuthHandler());
	sharedActivate(context);
}

export { deactivate };
