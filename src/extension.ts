import * as vscode from 'vscode';

function showInfo(message: string) {
    vscode.window.showInformationMessage(message);
}

function expandSelection() {
    console.log('expandSelection');
}


function shrinkSelection() {
    console.log('shrinkSelection');
}


export function activate(context: vscode.ExtensionContext) {
	console.log('扩展 "vsc-select" 已激活！');

	context.subscriptions.push(
        vscode.commands.registerCommand(
            'vsc-select.expand-select',
            () => {
		        expandSelection();
	        },
        ),
        vscode.commands.registerCommand(
            'vsc-select.shrink-select',
            () => {
                shrinkSelection();
	        },
        ),
    );
}

export function deactivate() {}
