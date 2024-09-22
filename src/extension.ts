import * as vscode from 'vscode';


const brackets = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
];
const quotes = ['"', "'", "`"];
const multipleQuotes = ['"""'];
let selectionHistory: Array<readonly vscode.Selection[]> = [];


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

function getSearchContext(selection: vscode.Selection): { text: string, start: number, end: number } {
    const editor = vscode.window.activeTextEditor;

    const text = editor!.document.getText();
    let start = editor!.document.offsetAt(selection.start);
    const end = editor!.document.offsetAt(selection.end);

    // 扩大搜索范围
    if (!isMultipleQuote(text, start, true)) {
        start -= 1;
    }

    return { text, start, end };
}

function toVscodeSelection(forwardResult: SearchResult, backwardResult: SearchResult, includeBracket: boolean): vscode.Selection {
    const editor = vscode.window.activeTextEditor;

    // 扩大搜索范围后导致 start 位置偏移，修复 start 位置
    if (!isMultipleQuote(forwardResult.bracket_or_quote)) {
        forwardResult.index += 1;
    }

    // 是否包含括号
    if (includeBracket) {
        forwardResult.index -= forwardResult.bracket_or_quote.length;
        backwardResult.index += backwardResult.bracket_or_quote.length;
    }

    // 将搜索结果转换为 Selection 对象
    return new vscode.Selection(
        editor!.document.positionAt(forwardResult.index),
        editor!.document.positionAt(backwardResult.index)
    );
}

function selectionLength(editor: vscode.TextEditor, selection: vscode.Selection): number {
    return editor.document.offsetAt(selection.end) - editor.document.offsetAt(selection.start);
}

function findForward(text: string, index: number): SearchResult | null {
    const bracketStack = [];

    for(let i = index; i > 0; i--) {
        // 优先匹配多引号
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
                const closeBracket = bracketStack.pop();
                if (!isMatch(char, closeBracket!)) {
                    showInfo('未找到匹配的括号');
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
        // 优先匹配多引号
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
                const openBracket = bracketStack.pop();
                if (!isMatch(openBracket!, char)) {
                    showInfo('未找到匹配的括号');
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

function selectText(selection: vscode.Selection): { forwardResult: SearchResult | null, backwardResult: SearchResult | null } {
    const { text, start, end } = getSearchContext(selection);

    if (start < 0 || end > text.length) {
        return { forwardResult: null, backwardResult: null };
    }

    let forwardResult = findForward(text, start);
    let backwardResult = findBackward(text, end);

    // 向前搜索到第一个匹配的括号
    while (
        forwardResult !== null && backwardResult !== null
        && !isMatch(forwardResult.bracket_or_quote, backwardResult.bracket_or_quote)
        && isQuote(forwardResult.bracket_or_quote)
    ) {
        forwardResult = findForward(text, forwardResult.index - forwardResult.bracket_or_quote.length);
    }
    // 向后搜索到第一个匹配的括号
    while (
        backwardResult !== null && forwardResult !== null
        && !isMatch(forwardResult.bracket_or_quote, backwardResult.bracket_or_quote)
        && isQuote(backwardResult.bracket_or_quote)
    ) {
        backwardResult = findBackward(text, backwardResult.index + backwardResult.bracket_or_quote.length);
    }
    // 未找到匹配的括号
    if (
        forwardResult !== null && backwardResult !== null
        && !isMatch(forwardResult.bracket_or_quote, backwardResult.bracket_or_quote)
    ) {
        showInfo('未找到匹配的括号');
        return { forwardResult: null, backwardResult: null };
    }
    // 已经选中了括号中的所有文本，则扩选到括号
    if (forwardResult?.index === start && backwardResult?.index === end) {
        forwardResult.index -= forwardResult.bracket_or_quote.length;
        backwardResult.index += backwardResult.bracket_or_quote.length;
    }

    return { forwardResult, backwardResult };
}

function expandSelection(includeBracket: boolean): void {
    const editor = vscode.window.activeTextEditor;
    const originSelections = editor!.selections;
    let selections = originSelections.map((originSelection) => {
        const selectResult = selectText(originSelection);

        return (selectResult.forwardResult !== null && selectResult.backwardResult !== null)
           ? toVscodeSelection(selectResult.forwardResult, selectResult.backwardResult, includeBracket)
           : originSelection;
    });

    const haveChanged = selections.some((selection, index) => {
        return !selection.isEqual(originSelections[index]);
    });

    if (haveChanged) {
        if (selectionHistory.length > 0) {
            const lastSelections = selectionHistory[selectionHistory.length - 1];

            if (lastSelections.length !== selections.length
                || lastSelections.some((selection, index) =>
                    selectionLength(editor!, selection) > selectionLength(editor!, selections[index]))
            ) {
                selectionHistory.length = 0;
            }
        }
        selectionHistory.push(originSelections);
        editor!.selections = selections;
    }
}

function shrinkSelection() {
    const editor = vscode.window.activeTextEditor;
    const lastSelections = selectionHistory.pop();

    if (lastSelections) {
        editor!.selections = lastSelections;
    }
}


export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
        vscode.commands.registerCommand(
            'vsc-select.expand-select',
            () => {
		        expandSelection(false);
	        },
        ),
        vscode.commands.registerCommand(
            'vsc-select.shrink-select',
            () => {
                shrinkSelection();
	        },
        ),
        vscode.commands.registerCommand(
            'vsc-select.expand-include-select',
            () => {
                expandSelection(true);
            },
        ),
    );
}

export function deactivate() {}
