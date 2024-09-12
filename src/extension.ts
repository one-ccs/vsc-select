import * as vscode from 'vscode';


const brackets = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
];
const quotes = ['"', "'", "`"];
const multipleQuotes = ['"""'];
const selectionHistory = [];

vscode.window.onDidChangeActiveTextEditor(() => { selectionHistory.length = 0; });

class SearchResult {
    constructor(public bracket_or_quote: string, public index: number) {}
}

function isOpenBracket(char: string): boolean {
    return brackets.some(([open, close]) => char === open);
}

function isCloseBracket(char: string): boolean {
    return brackets.some(([open, close]) => char === close);
}

function isQuote(char: string): boolean {
    return quotes.includes(char);
}

function isMultipleQuote(text: string, index: number | null = null, isForward: boolean | null = null): boolean {
    if (text !== null && index !== null && isForward!== null) {
        return isForward
            ? multipleQuotes.some((quote) => text.slice(index - quote.length, index) === quote)
            : multipleQuotes.some((quote) => text.slice(index, index + quote.length) === quote);
    }
    return multipleQuotes.includes(text);
}

function getMultipleQuote(text: string, index: number, isForward: boolean): string | undefined {
    return isForward
        ? multipleQuotes.find((quote) => text.slice(index - quote.length, index) === quote)
        : multipleQuotes.find((quote) => text.slice(index, index + quote.length) === quote);
}

function isMatch(open: string, close: string): boolean {
    if (isQuote(open)) {
        return open === close;
    }
    if (isMultipleQuote(open)) {
        return open === close;
    }
    return brackets.some(([o, c]) => o === open && c === close);
}

function showInfo(message: string): void {
    vscode.window.showInformationMessage(message);
}

function toVscodeSelection(start: SearchResult, end: SearchResult): vscode.Selection {
    const editor = vscode.window.activeTextEditor;

    return new vscode.Selection(
        editor!.document.positionAt(start.index + 1),
        editor!.document.positionAt(end.index)
    );
}

function findForward(text: string, index: number): SearchResult | null {
    const bracketStack = [];

    for(let i = index; i > 0; i--) {
        if (isMultipleQuote(text, i, true)) {
            const multipleQuote = getMultipleQuote(text, i, true);
            return new SearchResult(multipleQuote!, i);
        }

        const char = text.charAt(i);

        if (isQuote(char) && bracketStack.length === 0) {
            return new SearchResult(char, i);
        }
        if (isOpenBracket(char)) {
            if (bracketStack.length === 0) {
                return new SearchResult(char, i);
            }
            else {
                const top = bracketStack.pop();
                if (!isMatch(top!, char)) {
                    showInfo('没有找到匹配的括号');
                    return null;
                }
            }
        }
        if (isCloseBracket(char)) {
            bracketStack.push(char);
        }
    }
    return null;
}

function findBackward(text: string, index: number): SearchResult | null {
    const bracketStack = [];

    for(let i = index; i < text.length; i++) {
        if (isMultipleQuote(text, i, false)) {
            const multipleQuote = getMultipleQuote(text, i, false);
            return new SearchResult(multipleQuote!, i);
        }

        const char = text.charAt(i);
        if (isQuote(char) && bracketStack.length === 0) {
            return new SearchResult(char, i);
        }
        if (isCloseBracket(char)) {
            if (bracketStack.length === 0) {
                return new SearchResult(char, i);
            }
            else {
                const top = bracketStack.pop();
                if (!isMatch(top!, char)) {
                    showInfo('没有找到匹配的括号');
                    return null;
                }
            }
        }
        if (isOpenBracket(char)) {
            bracketStack.push(char);
        }
    }
    return null;
}

function selectText(selection: vscode.Selection): { start: SearchResult | null, end: SearchResult | null } {
    const editor = vscode.window.activeTextEditor;

    const text = editor!.document.getText();
    const start = editor!.document.offsetAt(selection.start);
    const end = editor!.document.offsetAt(selection.end);

    let forwardResult = findForward(text, start);
    let backwardResult = findBackward(text, end);

    while (
        forwardResult !== null && backwardResult !== null
        && !isMatch(forwardResult.bracket_or_quote, backwardResult.bracket_or_quote)
        && isQuote(forwardResult.bracket_or_quote)
    ) {
        forwardResult = findForward(text, forwardResult.index - forwardResult.bracket_or_quote.length);
    }
    while (
        backwardResult !== null && forwardResult !== null
        && !isMatch(forwardResult.bracket_or_quote, backwardResult.bracket_or_quote)
        && isQuote(backwardResult.bracket_or_quote)
    ) {
        backwardResult = findBackward(text, backwardResult.index + backwardResult.bracket_or_quote.length);
    }
    if (
        forwardResult !== null && backwardResult !== null
        && !isMatch(forwardResult.bracket_or_quote, backwardResult.bracket_or_quote)) {
        showInfo('没有找到匹配的括号');
        return { start: null, end: null };
    }

    return { start: forwardResult, end: backwardResult };
}

function expandSelection() {
    const editor = vscode.window.activeTextEditor;
    let originSelections = editor!.selections;
    let selections = originSelections.map((originSelection) => {
        const selectResult = selectText(originSelection);

        return (selectResult.start !== null && selectResult.end !== null)
           ? toVscodeSelection(selectResult.start, selectResult.end)
           : originSelection;
    });

    console.log(selections);

    editor!.selections = selections;
}


function shrinkSelection() {
}


export function activate(context: vscode.ExtensionContext) {
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
