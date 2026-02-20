import React from 'react';
import JsonViewer from './JsonViewer.jsx';

export default function PromptViewer({ run }) {
  const inputs = tryParse(run.inputs);
  const outputs = tryParse(run.outputs);

  return (
    <div className="space-y-3 text-xs">
      {inputs && (
        <div>
          <div className="text-gray-500 font-medium mb-1">Input</div>
          <div className="bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-96 font-mono">
            <JsonViewer data={inputs} defaultExpandDepth={2} />
          </div>
        </div>
      )}
      {outputs && (
        <div>
          <div className="text-gray-500 font-medium mb-1">Output</div>
          <div className="bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-96 font-mono">
            <JsonViewer data={outputs} defaultExpandDepth={2} />
          </div>
        </div>
      )}
      {run.tokens_prompt != null && (
        <div className="text-gray-500">
          Tokens: prompt={run.tokens_prompt} / completion={run.tokens_completion}
        </div>
      )}
    </div>
  );
}

function tryParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return str; }
}
