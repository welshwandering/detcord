/**
 * Channel picker for the "Specific" target.
 *
 * Channel names come straight from Discord, so every row is built with DOM
 * APIs and `textContent` rather than interpolated into `innerHTML`.
 */

import { CSS_PREFIX } from './constants';
import type { ApiClientPort, DiscordChannel } from './ports';

/** A channel offered in the picker. */
export interface PickerChannel {
  id: string;
  name: string;
}

/**
 * Reads a channel name back off the rendered picker rows.
 *
 * The picker is the only part of the UI that ever learns a channel's name, so
 * the summary line and the review receipt look it up here rather than
 * carrying names through the run config.
 *
 * @param root - Element containing the picker markup
 * @param id - Channel ID to resolve
 * @returns The channel name, or undefined when the picker has not loaded it
 */
export function channelNameFromDom(root: ParentNode, id: string): string | undefined {
  for (const row of root.querySelectorAll('[data-channel-id]')) {
    if (row.getAttribute('data-channel-id') === id) {
      return row.querySelector(`.${CSS_PREFIX}-channel-name`)?.textContent?.trim() || undefined;
    }
  }
  return undefined;
}

/** Dependencies handed to the picker. */
export interface ChannelPickerOptions {
  /** Element containing the picker markup. */
  root: ParentNode;
  /** Shared selection set, owned by the wizard state. */
  selected: Set<string>;
  /** Called whenever the selection changes. */
  onChange?: () => void;
}

/** Renders and manages the multi-select channel list. */
export class ChannelPicker {
  private readonly root: ParentNode;
  private readonly selected: Set<string>;
  private readonly onChange: () => void;
  private channels: PickerChannel[] = [];
  private loading = false;

  constructor(options: ChannelPickerOptions) {
    this.root = options.root;
    this.selected = options.selected;
    this.onChange = options.onChange ?? ((): void => {});
  }

  /** Channels currently offered. */
  getChannels(): readonly PickerChannel[] {
    return this.channels;
  }

  /**
   * Loads the guild's channels and renders them.
   *
   * @param client - API client to load through
   * @param guildId - Guild to load, or null when not in a server
   */
  async load(client: ApiClientPort | null, guildId: string | null): Promise<void> {
    if (this.loading) {
      return;
    }
    if (!client || !guildId || guildId === '@me') {
      this.channels = [];
      this.renderMessage('Not in a server - enter a channel ID below instead.');
      return;
    }

    this.loading = true;
    this.renderMessage('Loading channels...');
    try {
      const channels = await client.getGuildChannels(guildId);
      this.channels = channels
        .map((channel: DiscordChannel) => ({ id: channel.id, name: channel.name ?? 'Unknown' }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.render();
    } catch (error) {
      this.channels = [];
      this.renderMessage(
        error instanceof Error
          ? `Could not load channels: ${error.message}`
          : 'Could not load channels.',
      );
    } finally {
      this.loading = false;
    }
  }

  /** Repaints the list from the current channel set. */
  render(): void {
    const list = this.root.querySelector<HTMLElement>('[data-bind="channelList"]');
    if (!list) {
      return;
    }
    if (this.channels.length === 0) {
      this.renderMessage('No channels found.');
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const channel of this.channels) {
      fragment.appendChild(this.createRow(channel));
    }
    list.textContent = '';
    list.appendChild(fragment);
    this.updateCount();
  }

  /**
   * Toggles a channel row.
   *
   * @param element - The clicked row
   */
  toggle(element: HTMLElement): void {
    const channelId = element.getAttribute('data-channel-id');
    if (!channelId) {
      return;
    }
    if (this.selected.has(channelId)) {
      this.selected.delete(channelId);
      element.classList.remove('selected');
    } else {
      this.selected.add(channelId);
      element.classList.add('selected');
    }
    this.updateCount();
    this.onChange();
  }

  /**
   * Filters visible rows by a search term.
   *
   * @param query - Case-insensitive substring to match on channel name
   */
  filter(query: string): void {
    const needle = query.trim().toLowerCase();
    for (const row of this.root.querySelectorAll<HTMLElement>('[data-channel-id]')) {
      const name = row.getAttribute('data-channel-name') ?? '';
      row.style.display = name.includes(needle) ? '' : 'none';
    }
  }

  /** Clears the loaded channel list and the rendered rows. */
  clear(): void {
    this.channels = [];
    const list = this.root.querySelector<HTMLElement>('[data-bind="channelList"]');
    if (list) {
      list.textContent = '';
    }
    this.updateCount();
  }

  /** Refreshes the "N channels selected" label. */
  updateCount(): void {
    const el = this.root.querySelector<HTMLElement>('[data-bind="selectedChannelCount"]');
    if (!el) {
      return;
    }
    const count = this.selected.size;
    el.textContent =
      count === 0 ? '' : count === 1 ? '1 channel selected' : `${count} channels selected`;
  }

  private createRow(channel: PickerChannel): HTMLElement {
    const row = document.createElement('div');
    row.className = `${CSS_PREFIX}-channel-item${this.selected.has(channel.id) ? ' selected' : ''}`;
    row.setAttribute('data-channel-id', channel.id);
    row.setAttribute('data-channel-name', channel.name.toLowerCase());
    row.setAttribute('data-action', 'toggleChannel');

    const checkbox = document.createElement('div');
    checkbox.className = `${CSS_PREFIX}-channel-checkbox`;
    row.appendChild(checkbox);

    const hash = document.createElement('span');
    hash.className = `${CSS_PREFIX}-channel-icon`;
    hash.textContent = '#';
    row.appendChild(hash);

    const name = document.createElement('span');
    name.className = `${CSS_PREFIX}-channel-name`;
    name.textContent = channel.name;
    row.appendChild(name);

    return row;
  }

  private renderMessage(message: string): void {
    const list = this.root.querySelector<HTMLElement>('[data-bind="channelList"]');
    if (!list) {
      return;
    }
    const notice = document.createElement('div');
    notice.className = `${CSS_PREFIX}-channel-loading`;
    notice.textContent = message;
    list.textContent = '';
    list.appendChild(notice);
    this.updateCount();
  }
}
