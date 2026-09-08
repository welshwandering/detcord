/**
 * Static markup for the Detcord window.
 *
 * Everything in here is trusted, developer-authored HTML. Dynamic values
 * (channel names, message content, error text) are never interpolated here -
 * they are written with `textContent` by the view modules.
 */

import { CSS_PREFIX } from './constants';
import { createResumePromptHTML, createRunChoiceHTML, createRunScreensHTML } from './run-markup';
import { createWizardStepsHTML } from './wizard-markup';

/** Icon shown on the floating trigger button. */
export const TRIGGER_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V8h14v10zm-9-4h4v2h-4z"/>
</svg>
`;

/** Icon for the window close button. */
export const CLOSE_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M18.3 5.71a.996.996 0 00-1.41 0L12 10.59 7.11 5.7A.996.996 0 105.7 7.11L10.59 12 5.7 16.89a.996.996 0 101.41 1.41L12 13.41l4.89 4.89a.996.996 0 101.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
</svg>
`;

/** Icon for the window minimise button. */
export const MINIMIZE_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M19 13H5v-2h14v2z"/>
</svg>
`;

/**
 * Builds the full window markup.
 *
 * @returns HTML string for the backdrop and window
 */
export function createWindowHTML(): string {
  return `
<div class="${CSS_PREFIX}-backdrop"></div>
<div class="${CSS_PREFIX}-window">
	<div class="${CSS_PREFIX}-header">
		<h2>Detcord</h2>
		<div class="${CSS_PREFIX}-header-buttons">
			<button class="${CSS_PREFIX}-minimize" data-action="minimize">${MINIMIZE_ICON}</button>
			<button class="${CSS_PREFIX}-close" data-action="close">${CLOSE_ICON}</button>
		</div>
	</div>

	<!-- Step Indicator -->
	<div class="${CSS_PREFIX}-steps" data-bind="stepIndicator">
		<div class="${CSS_PREFIX}-step-dot active" data-step="0"></div>
		<div class="${CSS_PREFIX}-step-dot" data-step="1"></div>
		<div class="${CSS_PREFIX}-step-dot" data-step="2"></div>
		<div class="${CSS_PREFIX}-step-dot" data-step="3"></div>
	</div>

${createRunChoiceHTML()}
	<div class="${CSS_PREFIX}-content">
		<!-- Setup Screen (Wizard Steps) -->
		<div class="${CSS_PREFIX}-screen active" data-screen="setup">

${createResumePromptHTML()}
${createWizardStepsHTML()}
		</div>

${createRunScreensHTML()}
	</div>
</div>
`;
}
