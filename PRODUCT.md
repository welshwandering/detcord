# Product

## Product promise

Detcord finds and permanently deletes only the signed-in person's own Discord
messages. The preview and the deletion run use the same target and filters, so
the person can trust the scope before committing an irreversible action.

Detcord is a controlled-demolition tool. It should feel like the panel of a
precision instrument: calm, legible at a glance, and explicit about what will
happen.

## Audience

Detcord is for people cleaning up their own Discord history for privacy or
personal housekeeping. Some use it once; others return periodically. They may
be anxious about deleting the wrong messages, especially when a run spans
several channels or years of history.

The interface must support careful decisions without making the work feel
alarming or casual.

## Purpose

Detcord must:

- identify the intended account, target, range, and filters;
- show a trustworthy preview before deletion is available;
- name the irreversible action and the number of messages affected;
- report deleted, skipped, already-gone, and failed outcomes honestly;
- keep long, rate-limited runs understandable and stoppable.

## Operating context

Detcord runs inside Discord's browser page, a hostile and frequently changing
host. It must never look like, imitate, or imply affiliation with Discord.

Discord controls search, deletion, indexing, and rate limits. Runs can take
hours. The browser tab may be backgrounded, which can slow timers. The
interface must continue to explain the current work without suggesting that a
wait is a failure.

## Constraints

- Production is one installable userscript.
- Discord's content-security policy rules out web fonts.
- There is no telemetry.
- Tokens are never persisted.
- Only the signed-in person's own messages can be deleted.
- Deletion is permanent.
- Runtime network requests go only to Discord.

## Voice

Use calm, factual, specific language. Titles state the decision or outcome.
Controls name their action. Status lines state what the engine is doing.
Errors name the problem and the recovery.

Never use jokes, euphemisms, or celebratory language around deletion.

## Evidence

The September 2026 audit found three failures that define this direction:

- preview and deletion could apply different targets or filters;
- completion could present failed or skipped messages as successful deletion;
- the countdown could survive the Detcord window closing and start an unseen
  run.

The product must make scope stable, outcomes honest, and delayed destructive
actions cancellable.
