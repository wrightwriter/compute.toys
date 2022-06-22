import Editor from '@monaco-editor/react'
import {useEffect, useRef} from "react";
import {wgslLanguageDef, wgslConfiguration} from 'public/grammars/wgsl'
import {defineMonacoTheme} from "theme/monacotheme";
import {useAtom} from "jotai";
import {codeAtom, parseErrorAtom} from "lib/atoms/atoms";


const Monaco = (props) => {
    const [code, setCode] = useAtom(codeAtom);
    const [parseError, setParseError] = useAtom(parseErrorAtom);

    const monacoRef = useRef<any | null>(null);
    const editorRef = useRef<any | null>(null);

    useEffect(() => {
        if(monacoRef.current && parseError) {
            // consider whether multi-model editing needs to be handled for some reason
            const model = monacoRef.current.editor.getModels()[0];
            let line = parseError.position.row;
            if(parseError.success) {
                monacoRef.current.editor.setModelMarkers(model, "owner", []);
            } else if (0 < line && line < model.getLineCount()) {
                if (parseError.position.col == model.getLineMaxColumn(line)) {
                    // naga emits some weird positions
                    line += 1;
                }
                monacoRef.current.editor.setModelMarkers(model, "owner",
                    [{
                        startLineNumber: line,
                        startColumn: model.getLineFirstNonWhitespaceColumn(line),
                        endLineNumber: line,
                        endColumn: model.getLineMaxColumn(line),
                        message: parseError.summary,
                        severity: monacoRef.current.MarkerSeverity.Error
                    }]);
            } else {
                monacoRef.current.editor.setModelMarkers(model, "owner",
                    [{
                        startLineNumber: 1,
                        startColumn: 1,
                        endLineNumber: model.getLineCount(),
                        endColumn: model.getLineMaxColumn(model.getLineCount()),
                        message: parseError.summary,
                        severity: monacoRef.current.MarkerSeverity.Error
                    }]);
            }

        }
    }, [parseError]);

    const editorWillMount = monaco => {
        if (!monaco.languages.getLanguages().some(({ id }) => id === 'wgsl')) {
            monaco.languages.register({ id: 'wgsl' });
            monaco.languages.setMonarchTokensProvider('wgsl', wgslLanguageDef());
            monaco.languages.setLanguageConfiguration('wgsl', wgslConfiguration());
            monaco.languages.registerHoverProvider('wgsl', {
                async provideHover(model, position) {
                    const n = position.lineNumber;
                    const line = model.getLineContent(n).split(' ');
                    if (line[0] === '#include') {
                        let name = line[1].slice(1, -1);
                        let resp = await fetch(`https://compute-toys.github.io/include/${name}.wgsl`);
                        if (resp.status !== 200) return;
                        let text = await resp.text();
                        return {
                            range: new monacoRef.current.Range(n, 1, n, model.getLineMaxColumn(n)),
                            contents: [
                                { value: '**SOURCE**' },
                                { value: '```wgsl\n' + text + '\n```' }
                            ]
                        };
                    }
                }
            });
            defineMonacoTheme(monaco, 'global');
        }
    }

    // height fills the screen with room for texture picker
    return <Editor
        height="calc(100vh - 270px)" // preference
        language="wgsl"
        onChange={(value, _event) => {
            setCode(value)
        }}
        beforeMount={editorWillMount}
        onMount={(editor, monaco) => {
            monacoRef.current = monaco;
            editorRef.current = editor;

            // https://github.com/microsoft/monaco-editor/issues/392
            document.fonts.ready.then(() => monaco.editor.remeasureFonts());
        }}
        options={props.editorOptions}
        theme='global' // preference
        value={code}
        width={undefined} // fit to bounding box
    />
}

export default Monaco