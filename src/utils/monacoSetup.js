/**
 * Local Monaco Editor Loader & Worker Setup
 * 
 * BugHunt runs in offline LAN environments without internet access.
 * By default, @monaco-editor/react attempts to fetch Monaco Editor from jsdelivr CDN at runtime.
 * This configuration routes all Monaco Editor loader requests to the local bundled package
 * and local web workers, ensuring the editor loads instantly with 0 internet/CDN dependencies.
 */

import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Configure Monaco Environment to use local Web Worker
if (typeof window !== 'undefined') {
  window.MonacoEnvironment = {
    getWorker(_workerId, _label) {
      return new EditorWorker();
    }
  };
}

// Point @monaco-editor/react loader to the local bundled Monaco instance
loader.config({ monaco });

// Ensure Monaco font metrics recalculate once system and web fonts are fully ready
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.ready.then(() => {
    try {
      monaco.editor.remeasureFonts();
    } catch {}
  });
}

export default monaco;
