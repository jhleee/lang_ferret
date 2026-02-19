import React, { useState } from 'react';

export default function PromptViewer({ run }) {
  const [expanded, setExpanded] = useState(false);
  const inputs = tryParse(run.inputs);
  const outputs = tryParse(run.outputs);

  if (run.run_type !== 'llm' && !expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="text-xs text-blue-400 hover:underline mt-1">
        Show I/O
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 text-xs">
      {inputs && (
        <div>
          <div className="text-gray-500 font-medium mb-1">Input</div>
          <pre className="bg-gray-900 rounded p-2 overflow-x-auto whitespace-pre-wrap text-gray-300 max-h-48 overflow-y-auto">
            {formatIO(inputs)}
          </pre>
        </div>
      )}
      {outputs && (
        <div>
          <div className="text-gray-500 font-medium mb-1">Output</div>
          <pre className="bg-gray-900 rounded p-2 overflow-x-auto whitespace-pre-wrap text-gray-300 max-h-48 overflow-y-auto">
            {formatIO(outputs)}
          </pre>
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

function formatIO(obj) {
  if (typeof obj === 'string') return obj;
  return JSON.stringify(obj, null, 2);
}
